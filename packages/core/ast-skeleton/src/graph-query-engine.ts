import { type RelationalEdge, type RelationalNode, RelationalGraph } from './relational-graph.js';
import { FuzzyMatcher } from './fuzzy-matcher.js';
import {
  type TraceResult,
  extractBlastRadius,
  extractScenes,
  extractSignals,
  formatTraceResult
} from './graph-trace-helpers.js';

export type { TraceResult } from './graph-trace-helpers.js';

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

    const connectedScenes = extractScenes([...upstream, ...downstream]);
    const connectedSignals = extractSignals([...upstream, ...downstream]);
    const blastRadiusFiles = extractBlastRadius(this.graph, targetId, upstream, downstream);
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
        const seen = new Set(edges.map(e => `${e.from}->${e.to}:${e.type}`));
        for (const e of this.graph.getIncoming(shortName)) {
          const key = `${e.from}->${e.to}:${e.type}`;
          if (!seen.has(key)) {
            seen.add(key);
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
        const seen = new Set(edges.map(e => `${e.from}->${e.to}:${e.type}`));
        for (const e of this.graph.getOutgoing(shortName)) {
          const key = `${e.from}->${e.to}:${e.type}`;
          if (!seen.has(key)) {
            seen.add(key);
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

    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
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

    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
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

  public formatTrace(res: TraceResult): string {
    return formatTraceResult(res);
  }
}
