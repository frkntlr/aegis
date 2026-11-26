import {
  RelationalGraphStorage,
  cleanDanglingGraphEdges,
  insertGraphEdge,
  insertGraphNode,
  normalizeGraphPath,
  type RelationalEdge,
  type RelationalEdgeType,
  type RelationalNode,
  type RelationalNodeType
} from './relational-graph-helpers.js';

export type {
  GraphSerialized,
  RelationalEdge,
  RelationalEdgeType,
  RelationalNode,
  RelationalNodeType
} from './relational-graph-helpers.js';

export class RelationalGraph extends RelationalGraphStorage {
  public addNode(node: RelationalNode): void {
    insertGraphNode(this.nodes, node);
  }

  public getNode(id: string): RelationalNode | undefined {
    return this.nodes.get(normalizeGraphPath(id));
  }

  public hasNode(id: string): boolean {
    return this.nodes.has(normalizeGraphPath(id));
  }

  public getAllNodes(): RelationalNode[] {
    return Array.from(this.nodes.values());
  }

  public getNodesByKind(kind: RelationalNodeType): RelationalNode[] {
    return Array.from(this.nodes.values()).filter(n => n.kind === kind);
  }

  public addEdge(edge: RelationalEdge): void {
    insertGraphEdge(this.outgoing, this.incoming, edge);
  }

  public hasEdge(from: string, to: string, type?: RelationalEdgeType): boolean {
    const edges = this.getOutgoing(from, type);
    const normTo = normalizeGraphPath(to);
    return edges.some(e => e.to === normTo);
  }

  public getOutgoing(id: string, type?: RelationalEdgeType): RelationalEdge[] {
    const edges = this.outgoing.get(normalizeGraphPath(id)) || [];
    return type ? edges.filter(e => e.type === type) : edges;
  }

  public getIncoming(id: string, type?: RelationalEdgeType): RelationalEdge[] {
    const edges = this.incoming.get(normalizeGraphPath(id)) || [];
    return type ? edges.filter(e => e.type === type) : edges;
  }

  public removeFileEdges(filePath: string): void {
    const normPath = normalizeGraphPath(filePath);
    const toRemove = new Set<string>();
    for (const [id, node] of this.nodes.entries()) {
      if (node.filePath === normPath) toRemove.add(id);
    }
    for (const id of toRemove) {
      this.nodes.delete(id);
      this.outgoing.delete(id);
      this.incoming.delete(id);
    }
    cleanDanglingGraphEdges(this.outgoing, this.incoming, toRemove);
  }
}
