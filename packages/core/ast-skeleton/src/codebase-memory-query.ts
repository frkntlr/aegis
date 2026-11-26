import { RelationalGraph } from './relational-graph.js';
import { CompositeGraphView } from './delta-overlay-graph.js';
import type { SliceResult } from './symbol-slice-extractor.js';
import { MemoryAdapterResolver } from './memory-adapter-resolver.js';
import { LiveHotPatcher } from './live-hot-patcher.js';
import { type ActiveLockInfo, WorktreeMutexShield } from '@aegis/shared';
import type { SymbolEntry } from './symbol-parser-types.js';
import type {
  CodebaseMemoryAdapters,
  CodebaseMemoryHost,
  MemoryNamespace,
  MemoryQueryOptions,
  MemoryQueryResult
} from './codebase-memory-types.js';

function findFirstSymbolByFilePath(ns: MemoryNamespace, symbol: string): SymbolEntry[] {
  const norm = symbol.replace(/\\/g, '/');
  for (const [fPath, fileObj] of Object.entries(ns.indexer.getDatabase().files)) {
    const isMatch = fPath === norm || fPath.endsWith('/' + norm) || fPath.endsWith('/' + symbol);
    if (isMatch && fileObj.symbols && fileObj.symbols.length > 0) {
      return [fileObj.symbols[0]];
    }
  }
  return [];
}

function buildSliceFromTarget(
  ns: MemoryNamespace,
  target: SymbolEntry,
  stored: string | undefined,
  contextLines: number
): SliceResult | null {
  if (!stored) {
    return ns.extractor.extractSliceFromEntry(target, process.cwd(), contextLines);
  }
  const isTsClass = target.kind === 'class' && (target.filePath.endsWith('.ts') || target.filePath.endsWith('.tsx'));
  if (isTsClass) {
    const classSkel = ns.extractor.extractClassSkeletonSlice(target.name, target.filePath, stored, target.startLine, target.endLine);
    if (classSkel) return classSkel;
  }
  return ns.extractor.sliceContent({
    symbolName: target.name,
    filePath: target.filePath,
    content: stored,
    startLine: target.startLine,
    endLine: target.endLine,
    contextLines
  });
}

function resolveMemorySlice(
  host: CodebaseMemoryHost,
  ns: MemoryNamespace,
  symbol: string,
  options: MemoryQueryOptions,
  worktreeId: string
): { slice: SliceResult | null; ambiguous?: string[] } {
  let matches = ns.indexer.findSymbols(symbol);
  if (matches.length === 0) matches = findFirstSymbolByFilePath(ns, symbol);
  if (matches.length === 0) return { slice: null };

  const ambiguous = matches.length > 1 ? [...new Set(matches.map(m => m.filePath))] : undefined;
  const filePathFilter = options.filePath;
  if (filePathFilter) {
    const filtered = matches.filter(m => m.filePath.endsWith(filePathFilter) || m.filePath === filePathFilter);
    if (filtered.length > 0) matches = filtered;
  }

  let target = matches[0];
  const stored = LiveHotPatcher.getOrLoadContent(host, ns, target.filePath, worktreeId);
  const reMatches = ns.indexer.findSymbols(symbol);
  if (reMatches.length > 0) target = reMatches[0];

  return { slice: buildSliceFromTarget(ns, target, stored, options.contextLines ?? 3), ambiguous };
}

function formatLockDecoratedSlice(slice?: string, filePath?: string, activeLock?: ActiveLockInfo | null): string | undefined {
  if (!slice || !activeLock?.warning) return slice;
  const pfx = (filePath?.endsWith('.gd') || filePath?.endsWith('.py')) ? '#' : '//';
  return `${activeLock.warning.split('\n').map(l => `${pfx} ${l}`).join('\n')}\n${slice}`;
}

function resolveDocsAndContracts(
  ns: MemoryNamespace,
  adapters: CodebaseMemoryAdapters,
  candidateIds: string[],
  codeOrSymbol: string,
  targetFile?: string
): { docs: string[]; externalContracts?: string[] } {
  const composite = ns.deltaOverlay?.getCompositeView() || new CompositeGraphView(ns.graph, new RelationalGraph());
  const ext = MemoryAdapterResolver.resolveExternalContracts(composite, candidateIds, adapters);
  const docs = [...new Set([...MemoryAdapterResolver.resolveGroundTruth(codeOrSymbol, adapters, targetFile), ...ext.docs])];
  return { docs, externalContracts: ext.externalContracts };
}

export function executeMemoryQuery(
  host: CodebaseMemoryHost,
  adapters: CodebaseMemoryAdapters,
  symbol: string,
  options: MemoryQueryOptions,
  worktreeId: string
): MemoryQueryResult {
  const ns = host.getNamespace(worktreeId);
  LiveHotPatcher.patchUncommitted(host, ns, worktreeId, options.repoRoot);
  const { slice: sliceResult, ambiguous: ambiguousMatches } = resolveMemorySlice(host, ns, symbol, options, worktreeId);
  const traceResult = ns.queryEngine.trace(symbol, options.maxDepth ?? 5);
  const isClass = /^[A-Z]\w+$/.test(symbol) || ns.indexer.findSymbols(symbol).some(s => s.kind === 'class');
  MemoryAdapterResolver.enrichClassTrace(ns.graph, ns.queryEngine, symbol, traceResult, isClass);

  const targetFile = sliceResult?.filePath || ns.indexer.findSymbols(symbol)[0]?.filePath;
  const activeLock = targetFile ? WorktreeMutexShield.inspectLock(targetFile, worktreeId) : null;
  const slice = formatLockDecoratedSlice(sliceResult?.codeSlice, targetFile, activeLock);
  const cIds = [symbol, traceResult.foundNode?.id, targetFile ? `${targetFile}::${symbol}` : undefined]
    .filter((id): id is string => Boolean(id));
  const { docs, externalContracts } = resolveDocsAndContracts(ns, adapters, cIds, slice || symbol, targetFile);

  return {
    symbol, found: Boolean(sliceResult || traceResult.foundNode), filePath: targetFile, ambiguousMatches, slice,
    startLine: sliceResult?.startLine, endLine: sliceResult?.endLine,
    tokenSavingsPercent: sliceResult?.tokenSavingsPercent ?? 0,
    callers: [...new Set(traceResult.upstreamEdges.map(e => e.from))],
    callees: [...new Set(traceResult.downstreamEdges.map(e => e.to))],
    blastRadius: traceResult.blastRadiusFiles,
    connectedSignals: traceResult.connectedSignals, connectedScenes: traceResult.connectedScenes,
    groundTruthDocs: docs, constitutionRules: MemoryAdapterResolver.resolveConstitution(adapters, targetFile),
    compressedLogs: MemoryAdapterResolver.compressLogs(options.rawLogs, adapters),
    diffBudget: sliceResult?.diffBudget, activeLock: activeLock || undefined, externalContracts
  };
}
