import type { DiffBudgetReport, ActiveLockInfo } from '@aegis/shared';
import type { SymbolIndexer } from './symbol-indexer.js';
import type { SymbolSliceExtractor } from './symbol-slice-extractor.js';
import type { RelationalGraph } from './relational-graph.js';
import type { DeltaOverlayGraph } from './delta-overlay-graph.js';
import type { GraphQueryEngine } from './graph-query-engine.js';
import type { CrossReferenceLinker } from './cross-reference-linker.js';
import type { LruFileBuffer } from './lru-file-buffer.js';

export interface CodebaseMemoryAdapters {
  docProvider?: (library: string, topic: string) => string | null;
  logCompressor?: (rawText: string) => { text: string; tokenSavingsPercent: number };
  constitutionProvider?: (filePath: string) => string[];
  persistToDisk?: boolean;
  lruCapacity?: number;
}

export interface MemoryQueryOptions {
  repoRoot?: string;
  worktreeId?: string;
  filePath?: string;
  rawLogs?: string;
  contextLines?: number;
  maxDepth?: number;
}

export interface MemoryQueryResult {
  symbol: string;
  found: boolean;
  filePath?: string;
  ambiguousMatches?: string[];
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
  activeLock?: ActiveLockInfo;
  externalContracts?: string[];
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
  deltaOverlay?: DeltaOverlayGraph;
}

export interface CodebaseMemoryHost {
  getNamespace(id?: string): MemoryNamespace;
  saveNamespaceToDisk(id?: string): void;
  indexFile(filePath: string, content: string, worktreeId?: string): boolean;
  removeFile(filePath: string, worktreeId?: string): boolean;
  pruneDeletedFiles(worktreeId?: string, cwd?: string): { prunedFiles: string[] };
  clearCache(worktreeId?: string): void;
}
