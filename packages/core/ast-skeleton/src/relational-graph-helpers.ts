import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored } from '@aegis/shared';

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

export function normalizeGraphPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function insertGraphNode(nodes: Map<string, RelationalNode>, node: RelationalNode): void {
  const normalized: RelationalNode = {
    ...node,
    id: normalizeGraphPath(node.id),
    filePath: normalizeGraphPath(node.filePath)
  };
  nodes.set(normalized.id, normalized);
}

export function insertGraphEdge(
  outgoing: Map<string, RelationalEdge[]>,
  incoming: Map<string, RelationalEdge[]>,
  edge: RelationalEdge
): void {
  const from = normalizeGraphPath(edge.from);
  const to = normalizeGraphPath(edge.to);
  const normalized: RelationalEdge = { ...edge, from, to };

  const outList = outgoing.get(from) || [];
  const exists = outList.some(e => e.to === to && e.type === normalized.type);
  if (exists) return;

  outList.push(normalized);
  outgoing.set(from, outList);

  const inList = incoming.get(to) || [];
  inList.push(normalized);
  incoming.set(to, inList);
}

export function cleanDanglingGraphEdges(
  outgoing: Map<string, RelationalEdge[]>,
  incoming: Map<string, RelationalEdge[]>,
  removedIds: Set<string>
): void {
  for (const [id, edges] of outgoing.entries()) {
    outgoing.set(id, edges.filter(e => !removedIds.has(e.to)));
  }
  for (const [id, edges] of incoming.entries()) {
    incoming.set(id, edges.filter(e => !removedIds.has(e.from)));
  }
}

export function writeGraphCacheFile(cachePath: string, payload: GraphSerialized): void {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${cachePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    try {
      fs.renameSync(tmpPath, cachePath);
    } catch {
      fs.copyFileSync(tmpPath, cachePath);
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch (rmErr: unknown) {
        debugLogIgnored('RelationalGraph:saveCacheCleanup', rmErr);
      }
    }
  } catch (err: unknown) {
    debugLogIgnored('RelationalGraph:saveCache', err);
  }
}

export function readGraphCacheFile(cachePath: string): GraphSerialized | null {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(raw) as GraphSerialized;
  } catch {
    return null;
  }
}

export class RelationalGraphStorage {
  protected nodes: Map<string, RelationalNode> = new Map();
  protected outgoing: Map<string, RelationalEdge[]> = new Map();
  protected incoming: Map<string, RelationalEdge[]> = new Map();

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
    for (const n of data.nodes || []) insertGraphNode(this.nodes, n);
    for (const e of data.edges || []) insertGraphEdge(this.outgoing, this.incoming, e);
  }

  public saveCache(cachePath: string): void {
    writeGraphCacheFile(cachePath, this.toJSON());
  }

  public loadCache(cachePath: string): boolean {
    const data = readGraphCacheFile(cachePath);
    if (!data) return false;
    this.fromJSON(data);
    return true;
  }

  public getCouplingMetrics(nodeId: string): { fanIn: number; fanOut: number; isHighCoupling: boolean } {
    const id = normalizeGraphPath(nodeId);
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
