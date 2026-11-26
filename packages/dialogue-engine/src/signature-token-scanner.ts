/**
 * @file signature-token-scanner.ts
 * Leaf scanner utilities for balanced parenthesis matching and top-level token splitting.
 * Complies with Demir Kafes: <245 lines/file, <40 lines/function, 0 any.
 */

type DepthKey = 'parenDepth' | 'bracketDepth' | 'braceDepth';

interface TokenScanState {
  cur: string;
  parenDepth: number;
  bracketDepth: number;
  braceDepth: number;
  inQuote: string | null;
}

const OPEN_DELIMITERS: Record<string, DepthKey> = {
  '(': 'parenDepth',
  '<': 'bracketDepth',
  '[': 'bracketDepth',
  '{': 'braceDepth'
};

const CLOSE_DELIMITERS: Record<string, DepthKey> = {
  ')': 'parenDepth',
  '>': 'bracketDepth',
  ']': 'bracketDepth',
  '}': 'braceDepth'
};

export function findMatchingParen(str: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function updateDepthAndAppend(ch: string, state: TokenScanState): void {
  const openKey = OPEN_DELIMITERS[ch];
  if (openKey) state[openKey]++;
  const closeKey = CLOSE_DELIMITERS[ch];
  if (closeKey) state[closeKey]--;
  state.cur += ch;
}

function stepTokenScan(str: string, i: number, delimiter: string, state: TokenScanState): string | null {
  const ch = str[i];
  if (state.inQuote) {
    state.cur += ch;
    if (ch === state.inQuote && str[i - 1] !== '\\') state.inQuote = null;
    return null;
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    state.inQuote = ch;
    state.cur += ch;
    return null;
  }
  const atTopLevel = state.parenDepth === 0 && state.bracketDepth === 0 && state.braceDepth === 0;
  if (ch === delimiter && atTopLevel) {
    const token = state.cur.trim();
    state.cur = '';
    return token;
  }
  updateDepthAndAppend(ch, state);
  return null;
}

export function splitTopLevelTokens(str: string, delimiter: string): string[] {
  const tokens: string[] = [];
  const state: TokenScanState = { cur: '', parenDepth: 0, bracketDepth: 0, braceDepth: 0, inQuote: null };
  for (let i = 0; i < str.length; i++) {
    const token = stepTokenScan(str, i, delimiter, state);
    if (token !== null) tokens.push(token);
  }
  if (state.cur.trim()) tokens.push(state.cur.trim());
  return tokens;
}
