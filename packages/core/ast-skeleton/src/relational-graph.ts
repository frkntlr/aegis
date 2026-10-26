import * as fs from 'node:fs';
import * as path from 'node:path';

export type RelationalNodeType =
  | 'file'
  | 'symbol'
  | 'type'
  | 'scene'
  | 'scene_node'
  | 'resource'
  | 'signal'
  | 'external_doc';

export interface RelationalNode {
  id: string;
  name: string;
  kind: RelationalNodeType;
  filePath: string;
  line?: number;
  metadata?: Record<string, string>;
}

export type RelationalEdgeType =
  | 'CALLS'
  | 'CALLS_SYMBOL'
  | 'CALLS_EXTERNAL'
  | 'EXTENDS_FRAMEWORK'
  | 'INSTANTIATES'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'REFERENCES_TYPE'
  | 'DEFINES_SIGNAL'
  | 'EMITS_SIGNAL'
  | 'CONNECTS_SIGNAL'
  | 'ATTACHES_SCRIPT'
  | 'ATTACHED_SCRIPT'
  | 'RE_EXPORTS'
  | 'DEPENDS_ON'
  | 'OVERRIDES';

export interface RelationalEdge {
  from: string;
  to: string;
  type: RelationalEdgeType;
  metadata?: Record<string, string>;
}

export interface GraphSerialized {
  version: string;
  lastUpdated: string;
  nodes: RelationalNode[];
  edges: RelationalEdge[];
}

export class RelationalGraph {
  private nodes: Map<string, RelationalNode> = new Map();
  private outgoing: Map<string, RelationalEdge[]> = new Map();
  private incoming: Map<string, RelationalEdge[]> = new Map();

  public addNode(node: RelationalNode): void {
    const normalized: RelationalNode = {
      ...node,
      id: node.id.replace(/\\/g, '/'),
      filePath: node.filePath.replace(/\\/g, '/')
    };
    this.nodes.set(normalized.id, normalized);
  }

  public getNode(id: string): RelationalNode | undefined {
    return this.nodes.get(id.replace(/\\/g, '/'));
  }

  public hasNode(id: string): boolean {
    return this.nodes.has(id.replace(/\\/g, '/'));
  }

  public getAllNodes(): RelationalNode[] {
    return Array.from(this.nodes.values());
  }

  public getNodesByKind(kind: RelationalNodeType): RelationalNode[] {
    return Array.from(this.nodes.values()).filter(n => n.kind === kind);
  }

  public addEdge(edge: RelationalEdge): void {
    const from = edge.from.replace(/\\/g, '/');
    const to = edge.to.replace(/\\/g, '/');
    const normalized: RelationalEdge = { ...edge, from, to };

    const outList = this.outgoing.get(from) || [];
    const exists = outList.some(e => e.to === to && e.type === normalized.type);
    if (!exists) {
      outList.push(normalized);
      this.outgoing.set(from, outList);

      const inList = this.incoming.get(to) || [];
      inList.push(normalized);
      this.incoming.set(to, inList);
    }
  }

  public hasEdge(from: string, to: string, type?: RelationalEdgeType): boolean {
    const edges = this.getOutgoing(from, type);
    const normTo = to.replace(/\\/g, '/');
    return edges.some(e => e.to === normTo);
  }

  public getOutgoing(id: string, type?: RelationalEdgeType): RelationalEdge[] {
    const edges = this.outgoing.get(id.replace(/\\/g, '/')) || [];
    return type ? edges.filter(e => e.type === type) : edges;
  }

  public getIncoming(id: string, type?: RelationalEdgeType): RelationalEdge[] {
    const edges = this.incoming.get(id.replace(/\\/g, '/')) || [];
    return type ? edges.filter(e => e.type === type) : edges;
  }

  public removeFileEdges(filePath: string): void {
    const normPath = filePath.replace(/\\/g, '/');
    const toRemove = new Set<string>();
    for (const [id, node] of this.nodes.entries()) {
      if (node.filePath === normPath) toRemove.add(id);
    }
    for (const id of toRemove) {
      this.nodes.delete(id);
      this.outgoing.delete(id);
      this.incoming.delete(id);
    }
    this.cleanDanglingEdges(toRemove);
  }

  private cleanDanglingEdges(removedIds: Set<string>): void {
    for (const [id, edges] of this.outgoing.entries()) {
      this.outgoing.set(id, edges.filter(e => !removedIds.has(e.to)));
    }
    for (const [id, edges] of this.incoming.entries()) {
      this.incoming.set(id, edges.filter(e => !removedIds.has(e.from)));
    }
  }

  public toJSON(): GraphSerialized {
    const edges: RelationalEdge[] = [];
    for (const list of this.outgoing.values()) {
      edges.push(...list);
    }
    return {
      version: '1.1.0',
      lastUpdated: new Date().toISOString(),
      nodes: Array.from(this.nodes.values()),
      edges
    };
  }

  public fromJSON(data: GraphSerialized): void {
    this.nodes.clear();
    this.outgoing.clear();
    this.incoming.clear();
    for (const n of data.nodes || []) this.addNode(n);
    for (const e of data.edges || []) this.addEdge(e);
  }

  public saveCache(cachePath: string): void {
    try {
      const dir = path.dirname(cachePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmpPath = `${cachePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.toJSON(), null, 2), 'utf8');
      try {
        fs.renameSync(tmpPath, cachePath);
      } catch {
        fs.copyFileSync(tmpPath, cachePath);
        try { fs.rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
      }
    } catch { /* ignore non-fatal */ }
  }

  public loadCache(cachePath: string): boolean {
    if (!fs.existsSync(cachePath)) return false;
    try {
      const raw = fs.readFileSync(cachePath, 'utf8');
      this.fromJSON(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }

  public getCouplingMetrics(nodeId: string): { fanIn: number; fanOut: number; isHighCoupling: boolean } {
    const id = nodeId.replace(/\\/g, '/');
    const fanIn = (this.incoming.get(id) || []).length;
    const fanOut = (this.outgoing.get(id) || []).length;
    return { fanIn, fanOut, isHighCoupling: fanIn > 10 };
  }

  public clear(): void {
    this.nodes.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }

  public get nodeCount(): number {
    return this.nodes.size;
  }

  public get edgeCount(): number {
    let count = 0;
    for (const list of this.outgoing.values()) count += list.length;
    return count;
  }
}
