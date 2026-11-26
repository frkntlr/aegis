import type { CageViolation } from '@aegis/shared';

export interface ScanState {
  inFunction: boolean;
  funcStartLine: number;
  braceDepth: number;
}

export interface FallbackScanContext {
  filePath: string;
  maxFunctionLines: number;
  violations: CageViolation[];
}

export function checkFunctionLimit(
  funcStart: number,
  funcLength: number,
  ctx: FallbackScanContext
): void {
  if (funcLength > ctx.maxFunctionLines) {
    ctx.violations.push({
      rule: 'MAX_FUNCTION_LINES',
      filePath: ctx.filePath,
      line: funcStart,
      message: `Function starting at line ${funcStart} exceeds ${ctx.maxFunctionLines} lines (actual: ${funcLength} lines).`,
      severity: 'error'
    });
  }
}

export function isLineFunctionStart(trimmed: string): boolean {
  const stripped = trimmed.replace(/^export\s+(default\s+)?/, '');
  const fnRegex = /^(public\s+|private\s+|protected\s+|static\s+)*(async\s+)?\w+\s*\([^)]*\)\s*[:\w<>\s]*\{?/;
  return (
    stripped.startsWith('function ') ||
    stripped.startsWith('async function ') ||
    stripped.startsWith('func ') ||
    stripped.startsWith('func(') ||
    stripped.startsWith('fn ') ||
    stripped.startsWith('pub fn ') ||
    stripped.startsWith('async fn ') ||
    /=>\s*\{/.test(trimmed) ||
    Boolean(stripped.match(fnRegex))
  );
}

export function updateBraces(
  line: string,
  state: ScanState,
  lineIndex: number,
  ctx: FallbackScanContext
): void {
  const cleanLine = line
    .replace(/"(\\.|[^"\\])*"/g, '""')
    .replace(/'(\\.|[^'\\])*'/g, "''")
    .replace(/`(\\.|[^`\\])*`/g, '``')
    .replace(/\/\/.*$/gm, '');

  for (const ch of cleanLine) {
    if (ch === '{') state.braceDepth++;
    if (ch === '}') state.braceDepth--;
  }

  if (state.braceDepth <= 0 && cleanLine.includes('}')) {
    const funcLength = lineIndex + 1 - state.funcStartLine + 1;
    checkFunctionLimit(state.funcStartLine, funcLength, ctx);
    state.inFunction = false;
  }
}

function isIndentationFuncDef(trimmed: string): boolean {
  return (
    trimmed.startsWith('def ') ||
    trimmed.startsWith('async def ') ||
    trimmed.startsWith('func ') ||
    trimmed.startsWith('static func ')
  );
}

export function validateIndentationBased(lines: string[], ctx: FallbackScanContext): void {
  let inFunction = false;
  let funcStart = 0;
  let baseIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = (line.match(/^[\t\s]*/)?.[0] ?? '').replace(/\t/g, '    ').length;
    if (inFunction && indent <= baseIndent) {
      checkFunctionLimit(funcStart + 1, i - funcStart, ctx);
      inFunction = false;
    }
    if (!inFunction && isIndentationFuncDef(trimmed)) {
      inFunction = true;
      funcStart = i;
      baseIndent = indent;
    }
  }
  if (inFunction) {
    checkFunctionLimit(funcStart + 1, lines.length - funcStart, ctx);
  }
}

function stripBlockComments(
  rawLine: string,
  inBlockComment: boolean
): { line: string; inBlockComment: boolean; skip: boolean } {
  let line = rawLine;
  if (inBlockComment) {
    if (!line.includes('*/')) {
      return { line: '', inBlockComment: true, skip: true };
    }
    line = line.slice(line.indexOf('*/') + 2);
    inBlockComment = false;
  }
  if (line.includes('/*')) {
    if (!line.includes('*/')) {
      return { line: line.slice(0, line.indexOf('/*')), inBlockComment: true, skip: false };
    }
    line = line.replace(/\/\*.*?\*\//g, '');
  }
  return { line, inBlockComment, skip: false };
}

export function validateLineBased(lines: string[], ctx: FallbackScanContext): void {
  const state: ScanState = { inFunction: false, funcStartLine: 0, braceDepth: 0 };
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripBlockComments(lines[i], inBlockComment);
    inBlockComment = stripped.inBlockComment;
    if (stripped.skip) continue;

    const trimmed = stripped.line.trim();
    if (!state.inFunction && isLineFunctionStart(trimmed)) {
      state.inFunction = true;
      state.funcStartLine = i + 1;
      state.braceDepth = 0;
    }
    if (state.inFunction) {
      updateBraces(stripped.line, state, i, ctx);
    }
  }
}
