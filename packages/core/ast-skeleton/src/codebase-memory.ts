import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SymbolIndexer } from './symbol-indexer.js';
import { SymbolSliceExtractor, type SliceResult } from './symbol-slice-extractor.js';
import { RelationalGraph } from './relational-graph.js';
import { GraphQueryEngine } from './graph-query-engine.js';
import { CrossReferenceLinker } from './cross-reference-linker.js';
import { MemoryAdapterResolver } from './memory-adapter-resolver.js';
import { LruFileBuffer } from './lru-file-buffer.js';
import { MemoryDiskStore } from './memory-disk-store.js';
import { GitFastSyncEngine } from './git-fast-sync.js';
import { ActiveHeadResolver } from './active-head-resolver.js';
import { LiveHotPatcher } from './live-hot-patcher.js';
import type { DiffBudgetReport } from '@aegis/shared';

export interface CodebaseMemoryAdapters {
  docProvider?: (library: string, topic: string) => string | null;
  logCompressor?: (rawText: string) => { text: string; tokenSavingsPercent: number };
  constitutionProvider?: (filePath: string) => string[];
  persistToDisk?: boolean;
  lruCapacity?: number;
}

export interface MemoryQueryOptions {
  worktreeId?: string;
  rawLogs?: string;
  contextLines?: number;
  maxDepth?: number;
}

export interface MemoryQueryResult {
  symbol: string;
  found: boolean;
  filePath?: string;
  slice?: string;
  startLine?: number;
  endLine?: number;
  tokenSavingsPercent?: number;
  callers: string[];
  callees: string[];
  blastRadius: string[];
  connectedSignals: string[];
  connectedScenes: string[];
  groundTruthDocs: string[];
  constitutionRules: string[];
  compressedLogs?: string;
  diffBudget?: DiffBudgetReport;
}

export interface MemoryStats {
  worktreeId: string;
  totalFiles: number;
  totalSymbols: number;
  totalNodes: number;
  totalEdges: number;
  estimatedTokenSavings: number;
}

export interface MemoryNamespace {
  indexer: SymbolIndexer;
  extractor: SymbolSliceExtractor;
  graph: RelationalGraph;
  linker: CrossReferenceLinker;
  queryEngine: GraphQueryEngine;
  fileHashes: Map<string, string>;
  mtimeFingerprints: Map<string, string>;
  fileContents: LruFileBuffer;
  lastCommit?: string;
}

export class CodebaseMemoryEngine {
  private namespaces = new Map<string, MemoryNamespace>();
  private adapters: CodebaseMemoryAdapters;

  constructor(adapters: CodebaseMemoryAdapters = {}) {
    this.adapters = adapters;
  }

  public static resolveWorktreeIdFromCwd(cwd = process.cwd()): string {
    return ActiveHeadResolver.resolveActiveWorktree(cwd);
  }

  private getNamespace(id = 'default'): MemoryNamespace {
    let ns = this.namespaces.get(id);
    if (!ns) {
      const indexer = new SymbolIndexer();
      const extractor = new SymbolSliceExtractor(indexer);
      const graph = new RelationalGraph();
      const linker = new CrossReferenceLinker(graph);
      const queryEngine = new GraphQueryEngine(graph);
      const fileContents = new LruFileBuffer(this.adapters.lruCapacity ?? 100);
      ns = { indexer, extractor, graph, linker, queryEngine, fileHashes: new Map(), mtimeFingerprints: new Map(), fileContents };
      MemoryDiskStore.load(id, ns, this.adapters.persistToDisk);

      if (ns.fileHashes.size === 0 && id !== 'default') {
        const baseNs = this.namespaces.get('default');
        if (baseNs) MemoryDiskStore.inherit(ns, baseNs);
      }
      this.namespaces.set(id, ns);
    }
    return ns;
  }

  public saveNamespaceToDisk(id = 'default'): void {
    const ns = this.namespaces.get(id);
    if (ns) MemoryDiskStore.save(id, ns, this.adapters.persistToDisk);
  }

  public static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public indexFile(filePath: string, content: string, worktreeId = 'default'): boolean {
    const norm = filePath.replace(/\\/g, '/');
    const ns = this.getNamespace(worktreeId);
    const hash = CodebaseMemoryEngine.hashContent(content);
    if (ns.fileHashes.get(norm) === hash) return false;

    ns.fileHashes.set(norm, hash);
    ns.fileContents.set(norm, content);
    const fp = GitFastSyncEngine.getFileFingerprint(norm);
    if (fp) ns.mtimeFingerprints.set(norm, fp);

    ns.indexer.indexFile(norm, content);
    ns.linker.linkSingleFile(norm, content);
    return true;
  }

  public removeFile(filePath: string, worktreeId = 'default'): boolean {
    const norm = filePath.replace(/\\/g, '/');
    const ns = this.getNamespace(worktreeId);
    if (!ns.fileHashes.has(norm)) return false;
    ns.fileHashes.delete(norm);
    ns.fileContents.delete(norm);
    ns.mtimeFingerprints.delete(norm);
    delete ns.indexer.getDatabase().files[norm];
    ns.graph.removeFileEdges(norm);
    this.saveNamespaceToDisk(worktreeId);
    return true;
  }

  public indexDirectory(
    dirPath: string,
    worktreeId = 'default',
    exts = ['.ts', '.tsx', '.gd', '.py', '.tscn', '.tres', '.rs', '.go', '.cpp']
  ): { indexed: number; cached: number; fastSynced?: boolean } {
    const ns = this.getNamespace(worktreeId);
    if (!fs.existsSync(dirPath)) return { indexed: 0, cached: 0 };

    const fastSync = GitFastSyncEngine.evaluateFastSync(ns.lastCommit);
    if (fastSync.canSkipScan && ns.fileHashes.size > 0) {
      return { indexed: 0, cached: ns.fileHashes.size, fastSynced: true };
    }

    const stats = { indexed: 0, cached: 0 };
    const scan = (cur: string) => {
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, e.name);
        if (e.isDirectory() && !['node_modules', '.git', 'dist', '.aegis'].includes(e.name)) {
          scan(full);
        } else if (e.isFile()) {
          this.scanFileEntry(full, full.replace(/\\/g, '/'), exts, ns, worktreeId, stats);
        }
      }
    };
    scan(dirPath);
    if (stats.indexed > 0 || (fastSync.headCommit && fastSync.headCommit !== ns.lastCommit)) {
      if (fastSync.headCommit) ns.lastCommit = fastSync.headCommit;
      this.saveNamespaceToDisk(worktreeId);
    }
    return { indexed: stats.indexed, cached: stats.cached, fastSynced: false };
  }

  private scanFileEntry(
    full: string,
    norm: string,
    exts: string[],
    ns: MemoryNamespace,
    worktreeId: string,
    stats: { indexed: number; cached: number }
  ): void {
    if (!exts.some(x => norm.endsWith(x))) return;
    const fp = GitFastSyncEngine.getFileFingerprint(full);
    if (fp && ns.mtimeFingerprints.get(norm) === fp && ns.fileHashes.has(norm)) {
      stats.cached++;
      return;
    }
    try {
      const content = fs.readFileSync(full, 'utf8');
      if (this.indexFile(full, content, worktreeId)) stats.indexed++;
      else stats.cached++;
    } catch { /* skip read error */ }
  }

  private resolveSlice(ns: MemoryNamespace, symbol: string, contextLines: number, worktreeId = 'default'): SliceResult | null {
    let matches = ns.indexer.findSymbols(symbol);
    if (matches.length === 0) {
      const norm = symbol.replace(/\\/g, '/');
      for (const [fPath, fileObj] of Object.entries(ns.indexer.getDatabase().files)) {
        if (fPath === norm || fPath.endsWith('/' + norm) || fPath.endsWith('/' + symbol)) {
          if (fileObj.symbols && fileObj.symbols.length > 0) {
            matches = [fileObj.symbols[0]];
            break;
          }
        }
      }
    }
    if (matches.length === 0) return null;
    let target = matches[0];
    const stored = LiveHotPatcher.getOrLoadContent(this, ns, target.filePath, worktreeId);
    const reMatches = ns.indexer.findSymbols(symbol);
    if (reMatches.length > 0) target = reMatches[0];

    if (stored) {
      if (target.kind === 'class' && (target.filePath.endsWith('.ts') || target.filePath.endsWith('.tsx'))) {
        const classSkel = ns.extractor.extractClassSkeletonSlice(target.name, target.filePath, stored, target.startLine, target.endLine);
        if (classSkel) return classSkel;
      }
      return ns.extractor.sliceContent(target.name, target.filePath, stored, target.startLine, target.endLine, contextLines);
    }
    return ns.extractor.extractSliceFromEntry(target, process.cwd(), contextLines);
  }

  public queryMemory(symbol: string, options: MemoryQueryOptions = {}): MemoryQueryResult {
    const worktreeId = options.worktreeId || 'default';
    const ns = this.getNamespace(worktreeId);
    LiveHotPatcher.patchUncommitted(this, ns, worktreeId);

    const sliceResult = this.resolveSlice(ns, symbol, options.contextLines ?? 3, worktreeId);
    const traceResult = ns.queryEngine.trace(symbol, options.maxDepth ?? 5);

    const isClass = /^[A-Z]\w+$/.test(symbol) || ns.indexer.findSymbols(symbol).some(s => s.kind === 'class');
    MemoryAdapterResolver.enrichClassTrace(ns.graph, ns.queryEngine, symbol, traceResult, isClass);

    const callers = traceResult.upstreamEdges.map(e => e.from);
    const callees = traceResult.downstreamEdges.map(e => e.to);
    const targetFile = sliceResult ? sliceResult.filePath : undefined;

    return {
      symbol,
      found: Boolean(sliceResult || traceResult.foundNode),
      filePath: targetFile,
      slice: sliceResult?.codeSlice,
      startLine: sliceResult?.startLine,
      endLine: sliceResult?.endLine,
      tokenSavingsPercent: sliceResult?.tokenSavingsPercent ?? 0,
      callers: [...new Set(callers)],
      callees: [...new Set(callees)],
      blastRadius: traceResult.blastRadiusFiles,
      connectedSignals: traceResult.connectedSignals,
      connectedScenes: traceResult.connectedScenes,
      groundTruthDocs: MemoryAdapterResolver.resolveGroundTruth(sliceResult?.codeSlice || symbol, this.adapters, targetFile),
      constitutionRules: MemoryAdapterResolver.resolveConstitution(this.adapters, targetFile),
      compressedLogs: MemoryAdapterResolver.compressLogs(options.rawLogs, this.adapters),
      diffBudget: sliceResult?.diffBudget
    };
  }

  public getMemoryStats(worktreeId = 'default'): MemoryStats {
    const ns = this.getNamespace(worktreeId);
    const db = ns.indexer.getDatabase();
    const files = Object.keys(db.files);
    let totalSymbols = 0;
    for (const f of files) totalSymbols += db.files[f]?.symbols?.length || 0;
    const nodes = ns.graph.getAllNodes();
    let totalEdges = 0;
    for (const n of nodes) totalEdges += ns.graph.getOutgoing(n.id).length;
    return {
      worktreeId,
      totalFiles: files.length,
      totalSymbols,
      totalNodes: nodes.length,
      totalEdges,
      estimatedTokenSavings: files.length > 0 ? 75 : 0
    };
  }

  public clearCache(worktreeId?: string): void {
    if (worktreeId) {
      const ns = this.namespaces.get(worktreeId);
      if (ns) ns.fileContents.clear();
      this.namespaces.delete(worktreeId);
    } else {
      for (const ns of this.namespaces.values()) ns.fileContents.clear();
      this.namespaces.clear();
    }
  }
}
