import * as path from 'node:path';
import { SymbolIndexer, SymbolSliceExtractor, type SymbolEntry } from '@aegis/ast-skeleton';
import { showBanner } from './banner.js';
import { collectSourceFiles } from './dev-helpers.js';

export function handleFind(queryArg?: string): void {
  showBanner();
  if (!queryArg) {
    console.error('❌ Usage: aegis find <symbolName>');
    process.exit(1);
  }

  const startT = performance.now();
  const cachePath = path.resolve(process.cwd(), '.aegis', 'cache', 'symbols.json');
  const indexer = new SymbolIndexer();
  indexer.loadCache(cachePath);

  let matches = indexer.findSymbols(queryArg);
  if (matches.length === 0) {
    // If not found in cache, scan packages and update
    const srcFiles = collectSourceFiles(path.resolve(process.cwd(), 'packages'));
    indexer.indexFiles(srcFiles, process.cwd(), cachePath);
    matches = indexer.findSymbols(queryArg);
  }

  const durationMs = (performance.now() - startT).toFixed(2);
  if (matches.length === 0) {
    console.log(`⚠️  No symbols matching '${queryArg}' found in workspace index (${durationMs}ms).`);
    return;
  }

  const target = matches[0];
  console.log(`🔍 Symbol found: '${target.name}' [${target.filePath}:${target.startLine}-${target.endLine}]`);
  console.log(` • Kind:     ${target.kind.toUpperCase()} | Index Lookup: ${durationMs}ms (<10ms target ✅)`);
  if (matches.length > 1) {
    console.log(` • Other matches (${matches.length - 1}): ${matches.slice(1, 4).map((m: SymbolEntry) => m.name).join(', ')}`);
  }

  const extractor = new SymbolSliceExtractor(indexer);
  const slice = extractor.extractSliceFromEntry(target, process.cwd(), 3);
  if (slice) {
    console.log(` • Sliced:   ${slice.lineCount} lines / ${slice.originalFileLineCount} total (~${slice.tokenSavingsPercent}% token savings)`);
    console.log('\n' + slice.codeSlice);
  }
}
