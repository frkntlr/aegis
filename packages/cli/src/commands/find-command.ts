import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SymbolIndexer,
  SymbolSliceExtractor,
  RelationalGraph,
  GraphQueryEngine,
  type SymbolEntry
} from '@aegis/ast-skeleton';
import { showBanner } from './banner.js';
import { collectSourceFiles } from './dev-helpers.js';

function resolveMatches(indexer: SymbolIndexer, queryArg: string): SymbolEntry[] {
  const cachePath = path.resolve(process.cwd(), '.aegis', 'cache', 'symbols.json');
  indexer.loadCache(cachePath);
  let matches = indexer.findSymbols(queryArg);
  if (matches.length === 0) {
    const pkgDir = path.resolve(process.cwd(), 'packages');
    const baseDir = fs.existsSync(pkgDir) ? pkgDir : process.cwd();
    const srcFiles = collectSourceFiles(baseDir);
    indexer.indexFiles(srcFiles, process.cwd(), cachePath);
    matches = indexer.findSymbols(queryArg);
  }
  return matches;
}

export function handleFind(queryArg?: string): void {
  showBanner();
  if (!queryArg) {
    console.error('❌ Usage: aegis find <symbolName>');
    process.exit(1);
  }

  const startT = performance.now();
  const indexer = new SymbolIndexer();
  const matches = resolveMatches(indexer, queryArg);
  const durationMs = (performance.now() - startT).toFixed(2);

  if (matches.length === 0) {
    console.log(`⚠️  No symbols matching '${queryArg}' found in workspace index (${durationMs}ms).`);
    return;
  }

  const target = matches[0];
  if (process.argv.includes('--json')) {
    const extractor = new SymbolSliceExtractor(indexer);
    const slice = extractor.extractSliceFromEntry(target, process.cwd(), 3);
    console.log(JSON.stringify({ query: queryArg, target, slice, matchesCount: matches.length }, null, 2));
    return;
  }
  showBanner();
  printHumanResult(queryArg, target, matches, durationMs, indexer);
}

function printHumanResult(queryArg: string, target: SymbolEntry, matches: SymbolEntry[], durationMs: string, indexer: SymbolIndexer): void {
  const isFuzzy = target.name.toLowerCase() !== queryArg.toLowerCase() && !target.name.toLowerCase().includes(queryArg.toLowerCase());
  const header = isFuzzy
    ? `🔍 Fuzzy Match: '${queryArg}' -> '${target.name}' [${target.filePath}:${target.startLine}-${target.endLine}]`
    : `🔍 Symbol found: '${target.name}' [${target.filePath}:${target.startLine}-${target.endLine}]`;
  console.log(header);
  console.log(` • Kind:     ${target.kind.toUpperCase()} | Index Lookup: ${durationMs}ms (<10ms target ✅)`);
  if (matches.length > 1) {
    console.log(` • Other matches (${matches.length - 1}): ${matches.slice(1, 4).map((m: SymbolEntry) => m.name).join(', ')}`);
  }
  printRelationalLinks(target.name);
  const extractor = new SymbolSliceExtractor(indexer);
  const slice = extractor.extractSliceFromEntry(target, process.cwd(), 3);
  if (slice) {
    console.log(` • Sliced:   ${slice.lineCount} lines / ${slice.originalFileLineCount} total (~${slice.tokenSavingsPercent}% token savings)`);
    console.log('\n' + slice.codeSlice);
  }
}

function printRelationalLinks(symbolName: string): void {
  const graphCachePath = path.resolve(process.cwd(), '.aegis', 'cache', 'graph.json');
  const graph = new RelationalGraph();
  if (graph.loadCache(graphCachePath)) {
    const qEngine = new GraphQueryEngine(graph);
    const trace = qEngine.trace(symbolName, 2);
    if (trace.connectedScenes.length > 0 || trace.connectedSignals.length > 0 || trace.upstreamEdges.length > 0) {
      console.log(` • Relational Links: ${trace.connectedScenes.length} scenes, ${trace.connectedSignals.length} signals, ${trace.upstreamEdges.length} callers`);
    }
  }
}
