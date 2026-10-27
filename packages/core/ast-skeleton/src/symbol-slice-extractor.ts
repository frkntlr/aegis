import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import type { SymbolDatabase, SymbolEntry } from './symbol-indexer.js';
import { SymbolIndexer } from './symbol-indexer.js';
import { TransitiveTypeResolver } from './transitive-type-resolver.js';
import { TransitiveTypeClosure } from './transitive-type-closure.js';
import { CalleeSignatureExtractor } from './callee-signature-extractor.js';
import { TypeScriptSkeletonExtractor } from './ts-extractor.js';
import { SliceAmbientEnricher } from './slice-ambient-enricher.js';
import { PreEmptiveDiffBudgeting, type DiffBudgetReport } from '@aegis/shared';

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

  private findClassDeclaration(sf: ts.SourceFile, name: string): ts.ClassDeclaration | null {
    let targetClass: ts.ClassDeclaration | null = null;
    const walk = (n: ts.Node): void => {
      if (targetClass) return;
      if (ts.isClassDeclaration(n) && n.name?.text === name) {
        targetClass = n;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return targetClass;
  }

  public extractClassSkeletonSlice(
    symbolName: string,
    filePath: string,
    content: string,
    startLine: number,
    endLine: number
  ): SliceResult | null {
    const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    const targetClass = this.findClassDeclaration(sf, symbolName);
    if (!targetClass) return null;

    const classSkeleton = TypeScriptSkeletonExtractor.formatClassSkeleton(targetClass, sf);
    const closure = this.typeClosure.resolveClosure(symbolName, filePath, content);
    const ambient = this.typeResolver.resolveAmbientClosure(symbolName, filePath, content);
    const ambientBlock = closure.formattedBlock || ambient.formattedBlock;
    const totalLines = content.split(/\r?\n/).length;
    const diffBudget = PreEmptiveDiffBudgeting.calculateBudget(totalLines);
    const budgetWarning = PreEmptiveDiffBudgeting.formatWarningForSlice(totalLines, undefined, '//');
    const sliceHeader = this.buildSliceHeader(
      symbolName, filePath, startLine, endLine, ambientBlock,
      '// 🧩 [Adaptive ClassSkeleton - Folded Method Bodies]', budgetWarning
    );
    const codeSlice = [...sliceHeader, classSkeleton, '// --- End Slice ---'].join('\n');
    const skelLines = classSkeleton.split('\n').length;
    const origLines = Math.max(1, endLine - startLine + 1);
    const savings = Math.max(80, Math.round(((origLines - skelLines) / origLines) * 100));

    return {
      symbol: symbolName, filePath, startLine, endLine, codeSlice,
      lineCount: skelLines, originalFileLineCount: origLines,
      tokenSavingsPercent: savings, ambientTypes: ambient.typeNames, diffBudget
    };
  }

  public static extractGdscriptAmbient(content: string): string {
    const lines = content.split(/\r?\n/);
    const ambientLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('extends ') ||
        trimmed.startsWith('class_name ') ||
        trimmed.startsWith('signal ') ||
        trimmed.startsWith('@onready ') ||
        (trimmed.startsWith('@export ') && trimmed.includes('var '))
      ) {
        ambientLines.push(trimmed);
      }
    }
    if (ambientLines.length === 0) return '';
    return ['# 🎮 [GDScript Ambient State - Signals & Onready Nodes]', ...ambientLines].join('\n');
  }

  public static extractFileImports(content: string, prefix = '//'): string {
    const lines = content.split(/\r?\n/);
    const importLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('import ') || trimmed.startsWith('export {') || trimmed.startsWith('from ')) {
        importLines.push(trimmed);
      }
    }
    if (importLines.length === 0) return '';
    return [`${prefix} 📦 [File Imports]`, ...importLines.map(l => `${prefix} - ${l}`)].join('\n');
  }

  public static extractPolyglotAmbient(filePath: string, content: string): string {
    const lines = content.split(/\r?\n/);
    const ambient: string[] = [];
    const isPy = filePath.endsWith('.py');
    const isRs = filePath.endsWith('.rs');
    const prefix = isPy ? '#' : '//';

    for (const line of lines) {
      const trimmed = line.trim();
      if (isPy && (trimmed.startsWith('import ') || trimmed.startsWith('from ') || trimmed.startsWith('class '))) {
        ambient.push(trimmed);
      } else if (isRs && (trimmed.startsWith('use ') || trimmed.startsWith('pub use ') || trimmed.startsWith('mod '))) {
        ambient.push(trimmed);
      } else if (filePath.endsWith('.go') && (trimmed.startsWith('package ') || trimmed.startsWith('import ') || trimmed.startsWith('type '))) {
        ambient.push(trimmed);
      }
    }
    if (ambient.length === 0) return '';
    const tag = isPy ? 'Python' : (isRs ? 'Rust' : 'Go');
    return [`${prefix} 🌐 [${tag} Ambient State - Imports & Scope]`, ...ambient.map(l => `${prefix} - ${l}`)].join('\n');
  }

  private computeDynamicFromLine(lines: string[], startLine: number, contextLines: number): number {
    let from = Math.max(1, startLine - contextLines);
    let cur = startLine - 1;
    while (cur >= 1) {
      const trimmed = lines[cur - 1].trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        from = Math.min(from, cur);
        cur--;
      } else {
        break;
      }
    }
    return Math.max(1, from);
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
    calleeBlock?: string,
    budgetWarning?: string
  ): string[] {
    const header = [`// --- Surgical Slice: ${symbolName} [${filePath}:${startLine}-${endLine}] ---`];
    if (budgetWarning) header.push(budgetWarning);
    if (ambientBlock) header.push(ambientBlock);
    if (calleeBlock) header.push(calleeBlock);
    return header;
  }

  private resolveAmbientBlocks(symbolName: string, filePath: string, content: string): {
    headerBlocks: string[];
    ambientTypes?: string[];
    calleeSignatures?: string[];
  } {
    const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    const isGd = filePath.endsWith('.gd');
    const isPoly = filePath.endsWith('.py') || filePath.endsWith('.rs') || filePath.endsWith('.go');
    const headerBlocks: string[] = [];

    if (isTs) {
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
    if (isGd) {
      const gdAmbient = SymbolSliceExtractor.extractGdscriptAmbient(content);
      if (gdAmbient) headerBlocks.push(gdAmbient);
    }
    if (isPoly) {
      const polyAmbient = SymbolSliceExtractor.extractPolyglotAmbient(filePath, content);
      if (polyAmbient) headerBlocks.push(polyAmbient);
    }
    return { headerBlocks };
  }

  private createSliceBudget(filePath: string, totalLines: number, startLine: number, endLine: number) {
    const prefix = (filePath.endsWith('.gd') || filePath.endsWith('.py')) ? '#' : '//';
    const funcLines = Math.max(1, endLine - startLine + 1);
    const diffBudget = PreEmptiveDiffBudgeting.calculateBudget(totalLines, funcLines);
    const budgetWarning = PreEmptiveDiffBudgeting.formatWarningForSlice(totalLines, funcLines, prefix);
    return { prefix, diffBudget, budgetWarning };
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
    const from = this.computeDynamicFromLine(lines, startLine, contextLines);
    const to = Math.min(lines.length, endLine + contextLines);
    const sanitized = SliceAmbientEnricher.sanitizeTemplateLiterals(lines, from, to);
    const formattedLines = this.formatSliceLines(sanitized, from, to, startLine, endLine);

    const { prefix, diffBudget, budgetWarning } = this.createSliceBudget(filePath, lines.length, startLine, endLine);
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
      symbol: symbolName,
      filePath,
      startLine,
      endLine,
      codeSlice,
      lineCount: slicedLineCount,
      originalFileLineCount: lines.length,
      tokenSavingsPercent: Math.max(0, savings),
      ambientTypes,
      calleeSignatures,
      diffBudget
    };
  }
}
