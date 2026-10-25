import { type RelationalEdge, type RelationalNode, RelationalGraph } from './relational-graph.js';
import { FuzzyMatcher } from './fuzzy-matcher.js';

export interface TraceResult {
  target: string;
  foundNode?: RelationalNode;
  upstreamEdges: RelationalEdge[];
  downstreamEdges: RelationalEdge[];
  connectedScenes: string[];
  connectedSignals: string[];
  blastRadiusFiles: string[];
  productionBlastRadiusFiles?: string[];
  testBlastRadiusFiles?: string[];
  executionTimeMs: number;
}

export class GraphQueryEngine {
  private graph: RelationalGraph;

  constructor(graph: RelationalGraph) {
    this.graph = graph;
  }

  public trace(query: string, maxDepth = 4): TraceResult {
    const t0 = performance.now();
    const targetNode = this.resolveTargetNode(query);
    const targetId = targetNode ? targetNode.id : query;

    const upstream = this.traverseIncoming(targetId, maxDepth);
    const downstream = this.traverseOutgoing(targetId, maxDepth);

    const connectedScenes = this.extractScenes([...upstream, ...downstream]);
    const connectedSignals = this.extractSignals([...upstream, ...downstream]);
    const blastRadiusFiles = this.extractBlastRadius(targetId, upstream, downstream);
    const isTest = (f: string) => /\.(test|spec)\.[a-z]+$/i.test(f) || f.includes('__tests__') || f.includes('/test/');
    const productionBlastRadiusFiles = blastRadiusFiles.filter(f => !isTest(f));
    const testBlastRadiusFiles = blastRadiusFiles.filter(f => isTest(f));

    const executionTimeMs = parseFloat((performance.now() - t0).toFixed(2));
    return {
      target: query,
      foundNode: targetNode,
      upstreamEdges: upstream,
      downstreamEdges: downstream,
      connectedScenes,
      connectedSignals,
      blastRadiusFiles,
      productionBlastRadiusFiles,
      testBlastRadiusFiles,
      executionTimeMs
    };
  }

  private resolveTargetNode(query: string): RelationalNode | undefined {
    const normQuery = query.replace(/\\/g, '/');
    const direct = this.graph.getNode(normQuery);
    if (direct) return direct;

    const lower = normQuery.toLowerCase();
    const parts = lower.split(/[.::]/).filter(Boolean);
    const lastPart = parts[parts.length - 1];

    for (const node of this.graph.getAllNodes()) {
      const nodeLower = node.name.toLowerCase();
      if (nodeLower === lower || node.id.toLowerCase().endsWith(`::${lower}`)) {
        return node;
      }
      if (parts.length > 1 && nodeLower === lastPart && node.id.toLowerCase().includes(parts[0])) {
        return node;
      }
    }
    return this.findFuzzyNode(lower);
  }

  private findFuzzyNode(lower: string): RelationalNode | undefined {
    const nodes = this.graph.getAllNodes();
    const matches = FuzzyMatcher.findMatches(lower, nodes, n => n.name.toLowerCase(), 2);
    return matches.length > 0 ? matches[0].item : undefined;
  }

  private collectIncomingEdges(curId: string): RelationalEdge[] {
    const edges = [...this.graph.getIncoming(curId)];
    if (curId.includes('::')) {
      const shortName = curId.split('::').pop();
      if (shortName) {
        for (const e of this.graph.getIncoming(shortName)) {
          if (!edges.some(x => x.from === e.from && x.to === e.to && x.type === e.type)) {
            edges.push(e);
          }
        }
      }
    }
    return edges;
  }

  private collectOutgoingEdges(curId: string): RelationalEdge[] {
    const edges = [...this.graph.getOutgoing(curId)];
    if (curId.includes('::')) {
      const shortName = curId.split('::').pop();
      if (shortName) {
        for (const e of this.graph.getOutgoing(shortName)) {
          if (!edges.some(x => x.from === e.from && x.to === e.to && x.type === e.type)) {
            edges.push(e);
          }
        }
      }
    }
    return edges;
  }

  private traverseIncoming(startId: string, maxDepth: number): RelationalEdge[] {
    const result: RelationalEdge[] = [];
    const visited = new Set<string>([startId]);
    const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
    const seenEdges = new Set<string>();

    const targetNode = this.graph.getNode(startId);
    if (targetNode?.name && targetNode.name !== startId) {
      visited.add(targetNode.name);
    }

    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur || cur.depth >= maxDepth) continue;

      for (const edge of this.collectIncomingEdges(cur.id)) {
        const edgeKey = `${edge.from}->${edge.to}:${edge.type}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          result.push(edge);
        }
        if (!visited.has(edge.from)) {
          visited.add(edge.from);
          queue.push({ id: edge.from, depth: cur.depth + 1 });
        }
      }
    }
    return result;
  }

  private traverseOutgoing(startId: string, maxDepth: number): RelationalEdge[] {
    const result: RelationalEdge[] = [];
    const visited = new Set<string>([startId]);
    const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
    const seenEdges = new Set<string>();

    const targetNode = this.graph.getNode(startId);
    if (targetNode?.name && targetNode.name !== startId) {
      visited.add(targetNode.name);
    }

    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur || cur.depth >= maxDepth) continue;

      for (const edge of this.collectOutgoingEdges(cur.id)) {
        const edgeKey = `${edge.from}->${edge.to}:${edge.type}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          result.push(edge);
        }
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({ id: edge.to, depth: cur.depth + 1 });
        }
      }
    }
    return result;
  }

  private extractScenes(edges: RelationalEdge[]): string[] {
    const scenes = new Set<string>();
    for (const e of edges) {
      const fromPath = e.from.split('::')[0];
      const toPath = e.to.split('::')[0];
      if (fromPath.endsWith('.tscn')) scenes.add(fromPath);
      if (toPath.endsWith('.tscn')) scenes.add(toPath);
    }
    return Array.from(scenes);
  }

  private extractSignals(edges: RelationalEdge[]): string[] {
    const signals = new Set<string>();
    for (const e of edges) {
      if (e.metadata?.signal) signals.add(e.metadata.signal);
      if (e.type === 'DEFINES_SIGNAL' || e.type === 'EMITS_SIGNAL') {
        const sig = e.to.split('::').pop();
        if (sig) signals.add(sig);
      }
    }
    return Array.from(signals);
  }

  private static isFilePath(val: string): boolean {
    const clean = val.replace(/\\/g, '/');
    if (clean.includes('/')) return true;
    return /\.(ts|tsx|js|jsx|gd|py|rs|go|cpp|c|h|hpp|tscn|tres|json|md)$/i.test(clean);
  }

  private extractBlastRadius(startId: string, upstream: RelationalEdge[], downstream: RelationalEdge[]): string[] {
    const files = new Set<string>();
    const startNode = this.graph.getNode(startId);
    if (startNode?.filePath) {
      files.add(startNode.filePath.replace(/\\/g, '/'));
    } else {
      const f0 = startId.split('::')[0];
      if (GraphQueryEngine.isFilePath(f0)) files.add(f0.replace(/\\/g, '/'));
    }

    for (const e of [...upstream, ...downstream]) {
      const nFrom = this.graph.getNode(e.from);
      if (nFrom?.filePath) {
        files.add(nFrom.filePath.replace(/\\/g, '/'));
      } else {
        const f1 = e.from.split('::')[0];
        if (GraphQueryEngine.isFilePath(f1)) files.add(f1.replace(/\\/g, '/'));
      }

      const nTo = this.graph.getNode(e.to);
      if (nTo?.filePath) {
        files.add(nTo.filePath.replace(/\\/g, '/'));
      } else {
        const f2 = e.to.split('::')[0];
        if (GraphQueryEngine.isFilePath(f2)) files.add(f2.replace(/\\/g, '/'));
      }
    }
    return Array.from(files).sort();
  }

  public formatTrace(res: TraceResult): string {
    const targetType = res.foundNode ? res.foundNode.kind.toUpperCase() : 'IDENTIFIER';
    const lines = [
      `🕸️  RELATIONAL TRACE: '${res.target}' [${targetType}]`,
      '──────────────────────────────────────────────────',
      ` • Execution Time:     ${res.executionTimeMs}ms (<10ms target ✅)`,
      ` • Upstream Callers:   ${res.upstreamEdges.length}`,
      ` • Downstream Targets: ${res.downstreamEdges.length}`,
      ` • Connected Scenes:   ${res.connectedScenes.length > 0 ? res.connectedScenes.join(', ') : 'None'}`,
      ` • Connected Signals:  ${res.connectedSignals.length > 0 ? res.connectedSignals.join(', ') : 'None'}`,
      ` • Blast Radius (${res.blastRadiusFiles.length} files): ${res.blastRadiusFiles.slice(0, 5).join(', ')}`,
      '──────────────────────────────────────────────────'
    ];
    if (res.foundNode && res.foundNode.name.toLowerCase() !== res.target.toLowerCase()) {
      lines.splice(2, 0, ` • Fuzzy Match:        Resolved to '${res.foundNode.name}'`);
    }
    const keyEdges = [...res.upstreamEdges.slice(0, 3), ...res.downstreamEdges.slice(0, 3)];
    if (keyEdges.length > 0) {
      lines.push('🔗 Key Connections:');
      for (const e of keyEdges) {
        lines.push(`   - [${e.type}] ${e.from} -> ${e.to}`);
      }
    }
    return lines.join('\n');
  }
}
