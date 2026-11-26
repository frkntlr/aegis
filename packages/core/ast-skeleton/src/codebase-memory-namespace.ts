import { SymbolIndexer } from './symbol-indexer.js';
import { SymbolSliceExtractor } from './symbol-slice-extractor.js';
import { RelationalGraph } from './relational-graph.js';
import { DeltaOverlayGraph } from './delta-overlay-graph.js';
import { GraphQueryEngine } from './graph-query-engine.js';
import { CrossReferenceLinker } from './cross-reference-linker.js';
import { LruFileBuffer } from './lru-file-buffer.js';
import { MemoryDiskStore } from './memory-disk-store.js';
import { ActiveHeadResolver } from './active-head-resolver.js';
import type { CodebaseMemoryAdapters, MemoryNamespace, MemoryStats } from './codebase-memory-types.js';

function createMemoryNamespace(
  id: string,
  adapters: CodebaseMemoryAdapters,
  baseNs?: MemoryNamespace
): MemoryNamespace {
  const indexer = new SymbolIndexer();
  const extractor = new SymbolSliceExtractor(indexer);
  const graph = new RelationalGraph();
  const linker = new CrossReferenceLinker(graph);
  const queryEngine = new GraphQueryEngine(graph);
  const fileContents = new LruFileBuffer(adapters.lruCapacity ?? 100);
  const deltaOverlay = new DeltaOverlayGraph({ localGraph: graph });
  deltaOverlay.loadExternal();

  const ns: MemoryNamespace = {
    indexer,
    extractor,
    graph,
    linker,
    queryEngine,
    fileHashes: new Map(),
    mtimeFingerprints: new Map(),
    fileContents,
    deltaOverlay
  };

  MemoryDiskStore.load(id, ns, adapters.persistToDisk);
  if (ns.fileHashes.size === 0 && id !== 'default' && baseNs) {
    MemoryDiskStore.inherit(ns, baseNs);
  }
  return ns;
}

export class CodebaseMemoryBase {
  protected namespaces = new Map<string, MemoryNamespace>();
  protected adapters: CodebaseMemoryAdapters;

  constructor(adapters: CodebaseMemoryAdapters = {}) {
    this.adapters = adapters;
  }

  public getNamespace(id = 'default'): MemoryNamespace {
    let ns = this.namespaces.get(id);
    if (!ns) {
      ns = createMemoryNamespace(id, this.adapters, this.namespaces.get('default'));
      this.namespaces.set(id, ns);
    }
    return ns;
  }

  public saveNamespaceToDisk(id?: string): void {
    const active = id || ActiveHeadResolver.resolveActiveWorktree();
    const ns = this.namespaces.get(active);
    if (ns) MemoryDiskStore.save(active, ns, this.adapters.persistToDisk);
  }

  public getMemoryStats(worktreeId?: string): MemoryStats {
    const active = worktreeId || ActiveHeadResolver.resolveActiveWorktree();
    const ns = this.getNamespace(active);
    const db = ns.indexer.getDatabase();
    const files = Object.keys(db.files);
    const totalSymbols = files.reduce((acc, f) => acc + (db.files[f]?.symbols?.length || 0), 0);
    const nodes = ns.graph.getAllNodes();
    const totalEdges = nodes.reduce((acc, n) => acc + ns.graph.getOutgoing(n.id).length, 0);
    return {
      worktreeId: active,
      totalFiles: files.length,
      totalSymbols,
      totalNodes: nodes.length,
      totalEdges,
      estimatedTokenSavings: files.length > 0 ? 75 : 0
    };
  }

  public getNamespaceFiles(worktreeId = 'default'): string[] {
    return Object.keys(this.getNamespace(worktreeId).indexer.getDatabase().files);
  }

  public clearCache(worktreeId?: string): void {
    if (worktreeId) {
      this.namespaces.get(worktreeId)?.fileContents.clear();
      this.namespaces.delete(worktreeId);
      return;
    }
    for (const ns of this.namespaces.values()) ns.fileContents.clear();
    this.namespaces.clear();
  }
}
