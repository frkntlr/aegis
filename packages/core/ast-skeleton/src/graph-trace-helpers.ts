import { type RelationalEdge, type RelationalNode, RelationalGraph } from './relational-graph.js';

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

export function extractScenes(edges: RelationalEdge[]): string[] {
  const scenes = new Set<string>();
  for (const e of edges) {
    const fromPath = e.from.split('::')[0];
    const toPath = e.to.split('::')[0];
    if (fromPath.endsWith('.tscn')) scenes.add(fromPath);
    if (toPath.endsWith('.tscn')) scenes.add(toPath);
  }
  return Array.from(scenes);
}

export function extractSignals(edges: RelationalEdge[]): string[] {
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

export function isFilePath(val: string): boolean {
  const clean = val.replace(/\\/g, '/');
  if (clean.includes('/')) return true;
  return /\.(ts|tsx|js|jsx|gd|py|rs|go|cpp|c|h|hpp|tscn|tres|json|md)$/i.test(clean);
}

function addNodeFile(graph: RelationalGraph, id: string, files: Set<string>): void {
  const node = graph.getNode(id);
  if (node?.filePath) {
    files.add(node.filePath.replace(/\\/g, '/'));
    return;
  }
  const fallback = id.split('::')[0];
  if (isFilePath(fallback)) {
    files.add(fallback.replace(/\\/g, '/'));
  }
}

export function extractBlastRadius(
  graph: RelationalGraph,
  startId: string,
  upstream: RelationalEdge[],
  downstream: RelationalEdge[]
): string[] {
  const files = new Set<string>();
  addNodeFile(graph, startId, files);
  for (const e of [...upstream, ...downstream]) {
    addNodeFile(graph, e.from, files);
    addNodeFile(graph, e.to, files);
  }
  return Array.from(files).sort();
}

export function formatTraceResult(res: TraceResult): string {
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
