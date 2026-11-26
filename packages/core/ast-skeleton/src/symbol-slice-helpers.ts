import ts from 'typescript';
import { PreEmptiveDiffBudgeting, type DiffBudgetReport } from '@aegis/shared';
import { TypeScriptSkeletonExtractor } from './ts-extractor.js';

export type { DiffBudgetReport };

export interface SliceContentOptions {
  symbolName: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  contextLines?: number;
}

export type SliceContentRestArgs =
  | []
  | [filePath: string, content: string, startLine: number, endLine: number, contextLines?: number];

export interface SliceHeaderOptions {
  symbolName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  ambientBlock?: string;
  calleeBlock?: string;
  budgetWarning?: string;
}

export function normalizeSliceContentArgs(
  nameOrOpts: string | SliceContentOptions,
  rest: SliceContentRestArgs
): Required<SliceContentOptions> {
  if (typeof nameOrOpts !== 'string') {
    return { ...nameOrOpts, contextLines: nameOrOpts.contextLines ?? 3 };
  }
  const [filePath = '', content = '', startLine = 1, endLine = 1, contextLines = 3] = rest;
  return { symbolName: nameOrOpts, filePath, content, startLine, endLine, contextLines };
}

export function findClassDeclaration(sf: ts.SourceFile, name: string): ts.ClassDeclaration | null {
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

export function buildClassSkeletonData(
  symbolName: string,
  filePath: string,
  content: string
): { classSkeleton: string; diffBudget: DiffBudgetReport; budgetWarning: string } | null {
  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const targetClass = findClassDeclaration(sf, symbolName);
  if (!targetClass) return null;

  const classSkeleton = TypeScriptSkeletonExtractor.formatClassSkeleton(targetClass, sf);
  const totalLines = content.split(/\r?\n/).length;
  const diffBudget = PreEmptiveDiffBudgeting.calculateBudget(totalLines);
  const budgetWarning = PreEmptiveDiffBudgeting.formatWarningForSlice(totalLines, undefined, '//');
  return { classSkeleton, diffBudget, budgetWarning };
}

export function computeDynamicFromLine(lines: string[], startLine: number, contextLines: number): number {
  let from = Math.max(1, startLine - contextLines);
  let cur = startLine - 1;
  while (cur >= 1) {
    const trimmed = lines[cur - 1].trim();
    const isComment = trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    if (!isComment) break;
    from = Math.min(from, cur);
    cur--;
  }
  return Math.max(1, from);
}

export function formatSliceLines(
  lines: string[],
  from: number,
  to: number,
  start: number,
  end: number
): string[] {
  const formatted: string[] = [];
  for (let i = from; i <= to; i++) {
    const marker = i >= start && i <= end ? '>' : ' ';
    const lineNumStr = String(i).padStart(4, ' ');
    formatted.push(`${marker} ${lineNumStr} | ${lines[i - 1]}`);
  }
  return formatted;
}

export function buildSliceHeader(opts: SliceHeaderOptions): string[] {
  const header = [`// --- Surgical Slice: ${opts.symbolName} [${opts.filePath}:${opts.startLine}-${opts.endLine}] ---`];
  if (opts.budgetWarning) header.push(opts.budgetWarning);
  if (opts.ambientBlock) header.push(opts.ambientBlock);
  if (opts.calleeBlock) header.push(opts.calleeBlock);
  return header;
}

export function createSliceBudget(
  filePath: string,
  totalLines: number,
  startLine: number,
  endLine: number
): { prefix: string; diffBudget: DiffBudgetReport; budgetWarning: string } {
  const prefix = filePath.endsWith('.gd') || filePath.endsWith('.py') ? '#' : '//';
  const funcLines = Math.max(1, endLine - startLine + 1);
  const diffBudget = PreEmptiveDiffBudgeting.calculateBudget(totalLines, funcLines);
  const budgetWarning = PreEmptiveDiffBudgeting.formatWarningForSlice(totalLines, funcLines, prefix);
  return { prefix, diffBudget, budgetWarning };
}
