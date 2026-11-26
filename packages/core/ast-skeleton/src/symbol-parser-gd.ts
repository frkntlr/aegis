import { type SymbolEntry, findIndentBlockEnd } from './symbol-parser-types.js';

export interface GdFunctionContext {
  lines: string[];
  lineIdx: number;
  normPath: string;
  curClass: string;
  codeOnly: string;
  fnMatch: RegExpMatchArray;
  symbols: SymbolEntry[];
}

export function findDecoratorStart(lines: string[], lineNum: number): number {
  let start = lineNum;
  while (start > 1 && lines[start - 2].trim().startsWith('@')) start--;
  return start;
}

export function findGdFuncEnd(lines: string[], startIdx: number): number {
  return findIndentBlockEnd(lines, startIdx, ['#', '//']);
}

export function parseGdFunction(ctx: GdFunctionContext): void {
  const { lines, lineIdx, normPath, curClass, codeOnly, fnMatch, symbols } = ctx;
  const fnName = curClass ? `${curClass}.${fnMatch[1]}` : fnMatch[1];
  const startLine = findDecoratorStart(lines, lineIdx + 1);
  const endLine = findGdFuncEnd(lines, lineIdx);
  const signature = codeOnly.replace(/:$/, '');
  symbols.push({
    name: fnName,
    kind: curClass ? 'method' : 'function',
    filePath: normPath,
    startLine,
    endLine,
    signature
  });
  if (!curClass) {
    const fallback = normPath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
    if (fallback) {
      symbols.push({
        name: `${fallback}.${fnMatch[1]}`,
        kind: 'method',
        filePath: normPath,
        startLine,
        endLine,
        signature
      });
    }
  }
}

export function attachFallbackClass(
  normPath: string,
  curClass: string,
  lineCount: number,
  symbols: SymbolEntry[]
): void {
  if (curClass) return;
  const fallback = normPath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
  if (fallback) {
    symbols.unshift({
      name: fallback,
      kind: 'class',
      filePath: normPath,
      startLine: 1,
      endLine: lineCount,
      signature: `class ${fallback}`
    });
  }
}
