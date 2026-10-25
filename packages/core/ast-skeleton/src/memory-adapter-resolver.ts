import type { RelationalGraph } from './relational-graph.js';
import type { GraphQueryEngine, TraceResult } from './graph-query-engine.js';

export interface MemoryResolverAdapters {
  docProvider?: (library: string, topic: string) => string | null;
  logCompressor?: (raw: string) => { text: string; tokenSavingsPercent: number };
  constitutionProvider?: (filePath: string) => string[];
}

export class MemoryAdapterResolver {
  public static resolveGroundTruth(code: string, adapters: MemoryResolverAdapters, filePath?: string): string[] {
    const docs: string[] = [];
    if (!adapters.docProvider) return docs;

    const isGodot = (filePath && filePath.endsWith('.gd')) || /PackedScene|CharacterBody2D|Node|signal/.test(code);
    if (isGodot) {
      const topic = /velocity|move_and_slide/.test(code) ? 'physics' : (/signal|emit|connect/.test(code) ? 'signals' : 'lifecycle');
      const doc = adapters.docProvider('godot4', topic) || adapters.docProvider('godot4', 'lifecycle');
      if (doc) docs.push(doc);
    }
    const isTs = (filePath && (filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) || /interface|type\s+|declare/.test(code);
    if (isTs) {
      const topic = /test|assert/.test(code) ? 'node-test' : 'clean-arch';
      const doc = adapters.docProvider('typescript', topic) || adapters.docProvider('typescript', 'node-test');
      if (doc) docs.push(doc);
    }
    return docs;
  }

  public static resolveConstitution(adapters: MemoryResolverAdapters, filePath?: string): string[] {
    if (adapters.constitutionProvider && filePath) {
      return adapters.constitutionProvider(filePath);
    }
    const rules = [
      'Iron Cage Rule 1: Max 300 lines per source file.',
      'Iron Cage Rule 2: Max 40 lines per function body.',
      'Iron Cage Rule 3: Surgical unified diff modifications only.'
    ];
    if (filePath && filePath.endsWith('.gd')) {
      rules.push('Godot Rule GD_007: Do not use get_parent() directly; decouple with signals.');
      rules.push('Godot Rule GD_005: Always free or add instantiated nodes to the scene tree.');
    }
    return rules;
  }

  public static compressLogs(rawLogs: string | undefined, adapters: MemoryResolverAdapters): string | undefined {
    if (!rawLogs) return undefined;
    if (adapters.logCompressor) {
      return adapters.logCompressor(rawLogs).text;
    }
    return rawLogs.split('\n').filter(l => !l.includes('node:internal')).join('\n');
  }

  public static enrichClassTrace(
    graph: RelationalGraph,
    queryEngine: GraphQueryEngine,
    symbol: string,
    traceResult: TraceResult,
    isClass: boolean
  ): void {
    if (!isClass) return;
    const className = traceResult.foundNode?.name || symbol;
    const methodPrefix = `${className}.`;
    const seenEdges = new Set(traceResult.upstreamEdges.map(e => `${e.from}->${e.to}:${e.type}`));

    for (const node of graph.getAllNodes()) {
      if (node.name.startsWith(methodPrefix) || node.id.includes(`::${methodPrefix}`)) {
        const methodTrace = queryEngine.trace(node.id, 2);
        for (const e of methodTrace.upstreamEdges) {
          const k = `${e.from}->${e.to}:${e.type}`;
          if (!seenEdges.has(k)) { seenEdges.add(k); traceResult.upstreamEdges.push(e); }
        }
        for (const e of methodTrace.downstreamEdges) {
          const k = `${e.from}->${e.to}:${e.type}`;
          if (!seenEdges.has(k)) { seenEdges.add(k); traceResult.downstreamEdges.push(e); }
        }
        for (const f of methodTrace.blastRadiusFiles) {
          if (!traceResult.blastRadiusFiles.includes(f)) traceResult.blastRadiusFiles.push(f);
        }
      }
    }
  }
}
