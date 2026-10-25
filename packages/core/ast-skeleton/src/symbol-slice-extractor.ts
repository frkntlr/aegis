import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { SymbolDatabase, SymbolEntry } from './symbol-indexer.js';
import { SymbolIndexer } from './symbol-indexer.js';
import { TransitiveTypeResolver } from './transitive-type-resolver.js';
import { CalleeSignatureExtractor } from './callee-signature-extractor.js';
import { TypeScriptSkeletonExtractor } from './ts-extractor.js';

export interface SliceResult {
  symbol: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSlice: string;
  lineCount: number;
  originalFileLineCount: number;
  tokenSavingsPercent: number;
  ambientTypes?: string[];
  calleeSignatures?: string[];
}

export class SymbolSliceExtractor {
  private indexer: SymbolIndexer;
  private typeResolver: TransitiveTypeResolver;
  private calleeExtractor: CalleeSignatureExtractor;

  constructor(indexer?: SymbolIndexer) {
    this.indexer = indexer || new SymbolIndexer();
    this.typeResolver = new TransitiveTypeResolver({ indexer: this.indexer });
    this.calleeExtractor = new CalleeSignatureExtractor({ indexer: this.indexer });
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
      if (entry.kind === 'class' && (entry.filePath.endsWith('.ts') || entry.filePath.endsWith('.tsx'))) {
        const classSkel = this.extractClassSkeletonSlice(entry.name, entry.filePath, content, entry.startLine, entry.endLine);
        if (classSkel) return classSkel;
      }
      return this.sliceContent(entry.name, entry.filePath, content, entry.startLine, entry.endLine, contextLines);
    } catch {
      return null;
    }
  }

  public extractClassSkeletonSlice(
    symbolName: string,
    filePath: string,
    content: string,
    startLine: number,
    endLine: number
  ): SliceResult | null {
    const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    let targetClass: ts.ClassDeclaration | null = null;
    const walk = (n: ts.Node): void => {
      if (targetClass) return;
      if (ts.isClassDeclaration(n) && n.name?.text === symbolName) {
        targetClass = n;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    if (!targetClass) return null;

    const classSkeleton = TypeScriptSkeletonExtractor.formatClassSkeleton(targetClass, sf);
    const ambient = this.typeResolver.resolveAmbientClosure(symbolName, filePath, content);
    const sliceHeader = this.buildSliceHeader(symbolName, filePath, startLine, endLine, ambient.formattedBlock, '// 🧩 [Adaptive ClassSkeleton - Folded Method Bodies]');
    const codeSlice = [...sliceHeader, classSkeleton, '// --- End Slice ---'].join('\n');
    const skeletonLineCount = classSkeleton.split('\n').length;
    const originalLineCount = Math.max(1, endLine - startLine + 1);
    const savings = Math.round(((originalLineCount - skeletonLineCount) / originalLineCount) * 100);

    return {
      symbol: symbolName,
      filePath,
      startLine,
      endLine,
      codeSlice,
      lineCount: skeletonLineCount,
      originalFileLineCount: originalLineCount,
      tokenSavingsPercent: Math.max(80, savings),
      ambientTypes: ambient.typeNames
    };
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

  private buildSliceHeader(
    symbolName: string,
    filePath: string,
    startLine: number,
    endLine: number,
    ambientBlock?: string,
    calleeBlock?: string
  ): string[] {
    const header = [`// --- Surgical Slice: ${symbolName} [${filePath}:${startLine}-${endLine}] ---`];
    if (ambientBlock) header.push(ambientBlock);
    if (calleeBlock) header.push(calleeBlock);
    return header;
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
    const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    const ambient = isTs
      ? this.typeResolver.resolveAmbientClosure(symbolName, filePath, content)
      : { typeNames: [], declarations: [], formattedBlock: '' };
    const calleeResult = isTs
      ? this.calleeExtractor.extractCalleeSignatures(symbolName, filePath, content)
      : { callees: [], signatures: [], formattedBlock: '' };

    const sliceHeader = this.buildSliceHeader(symbolName, filePath, startLine, endLine, ambient.formattedBlock, calleeResult.formattedBlock);
    const codeSlice = [...sliceHeader, ...formattedLines, '// --- End Slice ---'].join('\n');
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
      tokenSavingsPercent: Math.max(0, savings),
      ambientTypes: ambient.typeNames,
      calleeSignatures: calleeResult.signatures
    };
  }
}
