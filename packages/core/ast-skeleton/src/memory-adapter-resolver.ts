import * as fs from 'node:fs';
import type { RelationalGraph } from './relational-graph.js';
import type { CompositeGraphView } from './delta-overlay-graph.js';
import type { GraphQueryEngine, TraceResult } from './graph-query-engine.js';
import { LanguageBarrierGate } from './language-barrier-gate.js';
import { GodotTopicResolver } from './godot-topic-resolver.js';
import { DeprecationLinter, type DeprecationWarning } from './deprecation-linter.js';

export interface MemoryResolverAdapters {
  docProvider?: (library: string, topic: string) => string | null;
  logCompressor?: (raw: string) => { text: string; tokenSavingsPercent: number };
  constitutionProvider?: (filePath: string) => string[];
}

export class MemoryAdapterResolver {
  private static attachWarnings(doc: string, warnings: DeprecationWarning[], header: string): string {
    if (warnings.length === 0) return doc;
    const warnText = warnings.slice(0, 2).map(w => `  ⚠️ ${w.message}`).join('\n');
    return `${doc}\n\n${header}\n${warnText}`;
  }

  public static resolveGroundTruth(code: string, adapters: MemoryResolverAdapters, filePath?: string): string[] {
    const docs: string[] = [];
    if (!adapters.docProvider) return docs;

    const ecosystem = LanguageBarrierGate.resolveTargetEcosystem(filePath, code);

    if (ecosystem === 'godot') {
      const topic = GodotTopicResolver.resolveTopic(code);
      const doc = adapters.docProvider('godot4', topic) || adapters.docProvider('godot4', 'lifecycle');
      if (doc && LanguageBarrierGate.isAllowedDoc('godot', 'godot4')) {
        docs.push(MemoryAdapterResolver.attachWarnings(doc, DeprecationLinter.lintGodot(code), '## 🚨 Active Deprecation Warnings'));
      }
    } else if (ecosystem === 'typescript') {
      const topic = /test|assert/.test(code) ? 'node-test' : 'clean-arch';
      const doc = adapters.docProvider('typescript', topic) || adapters.docProvider('typescript', 'node-test');
      if (doc && LanguageBarrierGate.isAllowedDoc('typescript', 'typescript')) {
        docs.push(MemoryAdapterResolver.attachWarnings(doc, DeprecationLinter.lintTypeScript(code), '## 🚨 Active Strict Linter Warnings'));
      }
    }
    return docs;
  }

  public static resolveExternalContracts(
    composite: CompositeGraphView,
    candidateIds: string[],
    adapters: MemoryResolverAdapters
  ): { externalContracts: string[]; docs: string[] } {
    const contracts: string[] = [];
    const docs: string[] = [];
    const seenExt = new Set<string>();

    for (const cid of candidateIds) {
      const extNodes = composite.getExternalCallees(cid);
      for (const ext of extNodes) {
        if (seenExt.has(ext.id)) continue;
        seenExt.add(ext.id);

        const lib = ext.metadata?.library || 'external';
        const sig = ext.metadata?.signature ? `: ${ext.metadata.signature}` : '';
        const dep = ext.metadata?.deprecation ? ` [⚠️ DEPRECATED: ${ext.metadata.deprecation}]` : '';
        contracts.push(`[${lib}] ${ext.name}${sig}${dep}`);

        if (ext.metadata?.doc) {
          docs.push(ext.metadata.doc);
        } else if (adapters.docProvider) {
          const doc = adapters.docProvider(lib, ext.name);
          if (doc && !docs.includes(doc)) {
            docs.push(doc);
          }
        }
      }
    }
    return { externalContracts: contracts, docs };
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

  public static pruneDeleted(engine: { removeFile: (f: string, wt?: string) => boolean; getNamespaceFiles: (wt: string) => string[] }, activeWorktree: string, cwd = process.cwd()): string[] {
    const files = engine.getNamespaceFiles(activeWorktree);
    const pruned: string[] = [];
    for (const f of files) {
      const full = f.startsWith('/') || f.includes(':') ? f : `${cwd}/${f}`.replace(/\\/g, '/');
      if (!fs.existsSync(full)) {
        engine.removeFile(f, activeWorktree);
        pruned.push(f);
      }
    }
    return pruned;
  }
}
