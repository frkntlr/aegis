import * as fs from 'node:fs';
import * as path from 'node:path';
import { SymbolIndexer, type SymbolDatabase, type SymbolEntry } from './symbol-indexer.js';
import { TransitiveTypeResolver } from './transitive-type-resolver.js';
import { TransitiveTypeClosure } from './transitive-type-closure.js';
import { CalleeSignatureExtractor } from './callee-signature-extractor.js';
import { SliceAmbientEnricher } from './slice-ambient-enricher.js';
import { SliceAmbientExtractor } from './slice-ambient-extractor.js';
import {
  buildClassSkeletonData,
  buildSliceHeader,
  computeDynamicFromLine,
  createSliceBudget,
  formatSliceLines,
  normalizeSliceContentArgs,
  type DiffBudgetReport,
  type SliceContentOptions,
  type SliceContentRestArgs
} from './symbol-slice-helpers.js';

export type { SliceContentOptions, SliceContentRestArgs };

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
  diffBudget?: DiffBudgetReport;
}

export class SymbolSliceExtractor {
  private indexer: SymbolIndexer;
  private typeResolver: TransitiveTypeResolver;
  private typeClosure: TransitiveTypeClosure;
  private calleeExtractor: CalleeSignatureExtractor;

  constructor(indexer?: SymbolIndexer, typeClosure?: TransitiveTypeClosure) {
    this.indexer = indexer || new SymbolIndexer();
    this.typeResolver = new TransitiveTypeResolver({ indexer: this.indexer });
    this.typeClosure = typeClosure || new TransitiveTypeClosure({ maxDepth: 1, lineBudget: 50 });
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

    return this.extractSliceFromEntry(matches[0], baseDir, contextLines);
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
      // Unreadable target file; treat as non-sliceable
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
    const skelData = buildClassSkeletonData(symbolName, filePath, content);
    if (!skelData) return null;

    const closure = this.typeClosure.resolveClosure(symbolName, filePath, content);
    const ambient = this.typeResolver.resolveAmbientClosure(symbolName, filePath, content);
    const sliceHeader = buildSliceHeader({
      symbolName,
      filePath,
      startLine,
      endLine,
      ambientBlock: closure.formattedBlock || ambient.formattedBlock,
      calleeBlock: '// 🧩 [Adaptive ClassSkeleton - Folded Method Bodies]',
      budgetWarning: skelData.budgetWarning
    });
    const codeSlice = [...sliceHeader, skelData.classSkeleton, '// --- End Slice ---'].join('\n');
    const skelLines = skelData.classSkeleton.split('\n').length;
    const origLines = Math.max(1, endLine - startLine + 1);
    const savings = Math.max(80, Math.round(((origLines - skelLines) / origLines) * 100));

    return {
      symbol: symbolName, filePath, startLine, endLine, codeSlice,
      lineCount: skelLines, originalFileLineCount: origLines,
      tokenSavingsPercent: savings, ambientTypes: ambient.typeNames, diffBudget: skelData.diffBudget
    };
  }

  public static extractGdscriptAmbient(content: string): string {
    return SliceAmbientExtractor.extractGdscriptAmbient(content);
  }

  public static extractFileImports(content: string, prefix = '//'): string {
    return SliceAmbientExtractor.extractFileImports(content, prefix);
  }

  public static extractPolyglotAmbient(filePath: string, content: string): string {
    return SliceAmbientExtractor.extractPolyglotAmbient(filePath, content);
  }

  private resolveTsAmbientBlocks(symbolName: string, filePath: string, content: string): {
    headerBlocks: string[];
    ambientTypes?: string[];
    calleeSignatures?: string[];
  } {
    const headerBlocks: string[] = [];
    const fileImports = SymbolSliceExtractor.extractFileImports(content);
    if (fileImports) headerBlocks.push(fileImports);
    const closure = this.typeClosure.resolveClosure(symbolName, filePath, content);
    const ambient = this.typeResolver.resolveAmbientClosure(symbolName, filePath, content);
    const block = closure.formattedBlock || ambient.formattedBlock;
    if (block) headerBlocks.push(block);
    const enrichment = SliceAmbientEnricher.enrichTypeScript(symbolName, filePath, content, this.indexer);
    if (enrichment.headerLines.length > 0) headerBlocks.push(...enrichment.headerLines);
    const callee = this.calleeExtractor.extractCalleeSignatures(symbolName, filePath, content);
    if (callee.formattedBlock) headerBlocks.push(callee.formattedBlock);
    return { headerBlocks, ambientTypes: ambient.typeNames, calleeSignatures: callee.signatures };
  }

  private resolveAmbientBlocks(symbolName: string, filePath: string, content: string): {
    headerBlocks: string[];
    ambientTypes?: string[];
    calleeSignatures?: string[];
  } {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      return this.resolveTsAmbientBlocks(symbolName, filePath, content);
    }
    const headerBlocks: string[] = [];
    if (filePath.endsWith('.gd')) {
      const gdAmbient = SymbolSliceExtractor.extractGdscriptAmbient(content);
      if (gdAmbient) headerBlocks.push(gdAmbient);
    }
    if (filePath.endsWith('.py') || filePath.endsWith('.rs') || filePath.endsWith('.go')) {
      const polyAmbient = SymbolSliceExtractor.extractPolyglotAmbient(filePath, content);
      if (polyAmbient) headerBlocks.push(polyAmbient);
    }
    return { headerBlocks };
  }

  public sliceContent(
    nameOrOpts: string | SliceContentOptions,
    ...rest: SliceContentRestArgs
  ): SliceResult {
    const { symbolName, filePath, content, startLine, endLine, contextLines } =
      normalizeSliceContentArgs(nameOrOpts, rest);
    const lines = content.split(/\r?\n/);
    const from = computeDynamicFromLine(lines, startLine, contextLines);
    const to = Math.min(lines.length, endLine + contextLines);
    const sanitized = SliceAmbientEnricher.sanitizeTemplateLiterals(lines, from, to);
    const formattedLines = formatSliceLines(sanitized, from, to, startLine, endLine);

    const { prefix, diffBudget, budgetWarning } = createSliceBudget(filePath, lines.length, startLine, endLine);
    const { headerBlocks, ambientTypes, calleeSignatures } = this.resolveAmbientBlocks(symbolName, filePath, content);
    const sliceHeader = [
      `${prefix} --- Surgical Slice: ${symbolName} [${filePath}:${startLine}-${endLine}] ---`,
      budgetWarning,
      ...headerBlocks
    ];
    const codeSlice = [...sliceHeader, ...formattedLines, `${prefix} --- End Slice ---`].join('\n');
    const slicedLineCount = to - from + 1;
    const savings = lines.length > 0 ? Math.round(((lines.length - slicedLineCount) / lines.length) * 100) : 0;

    return {
      symbol: symbolName, filePath, startLine, endLine, codeSlice,
      lineCount: slicedLineCount, originalFileLineCount: lines.length,
      tokenSavingsPercent: Math.max(0, savings), ambientTypes, calleeSignatures, diffBudget
    };
  }
}
