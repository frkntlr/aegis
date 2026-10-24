import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SymbolDatabase, SymbolEntry } from './symbol-indexer.js';
import { SymbolIndexer } from './symbol-indexer.js';

export interface SliceResult {
  symbol: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSlice: string;
  lineCount: number;
  originalFileLineCount: number;
  tokenSavingsPercent: number;
}

export class SymbolSliceExtractor {
  private indexer: SymbolIndexer;

  constructor(indexer?: SymbolIndexer) {
    this.indexer = indexer || new SymbolIndexer();
  }

  public extractSlice(
    query: string,
    options: { db?: SymbolDatabase; baseDir?: string; contextLines?: number } = {}
  ): SliceResult | null {
    const baseDir = options.baseDir || process.cwd();
    const contextLines = options.contextLines ?? 3;
    const matches = this.indexer.findSymbols(query, options.db);
    if (matches.length === 0) return null;

    const target = matches[0];
    return this.extractSliceFromEntry(target, baseDir, contextLines);
  }

  public extractSliceFromEntry(entry: SymbolEntry, baseDir = process.cwd(), contextLines = 3): SliceResult | null {
    const fullPath = path.isAbsolute(entry.filePath) ? entry.filePath : path.join(baseDir, entry.filePath);
    if (!fs.existsSync(fullPath)) return null;

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      return this.sliceContent(entry.name, entry.filePath, content, entry.startLine, entry.endLine, contextLines);
    } catch {
      return null;
    }
  }

  private formatSliceLines(lines: string[], from: number, to: number, start: number, end: number): string[] {
    const formatted: string[] = [];
    for (let i = from; i <= to; i++) {
      const isTarget = i >= start && i <= end;
      const marker = isTarget ? '>' : ' ';
      const lineNumStr = String(i).padStart(4, ' ');
      formatted.push(`${marker} ${lineNumStr} | ${lines[i - 1]}`);
    }
    return formatted;
  }

  public sliceContent(
    symbolName: string,
    filePath: string,
    content: string,
    startLine: number,
    endLine: number,
    contextLines = 3
  ): SliceResult {
    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;
    const from = Math.max(1, startLine - contextLines);
    const to = Math.min(totalLines, endLine + contextLines);

    const formattedLines = this.formatSliceLines(lines, from, to, startLine, endLine);
    const codeSlice = [
      `// --- Surgical Slice: ${symbolName} [${filePath}:${startLine}-${endLine}] ---`,
      ...formattedLines,
      '// --- End Slice ---'
    ].join('\n');

    const slicedLineCount = to - from + 1;
    const savings = totalLines > 0 ? Math.round(((totalLines - slicedLineCount) / totalLines) * 100) : 0;

    return {
      symbol: symbolName,
      filePath,
      startLine,
      endLine,
      codeSlice,
      lineCount: slicedLineCount,
      originalFileLineCount: totalLines,
      tokenSavingsPercent: Math.max(0, savings)
    };
  }
}
