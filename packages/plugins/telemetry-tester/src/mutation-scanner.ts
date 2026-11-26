export interface TypeState {
  active: boolean;
  braceDepth: number;
  bracketDepth: number;
  expectingContinuation: boolean;
}

export interface ScanState {
  inBlockComment: boolean;
  templateStack: number[];
}

interface ScanStep {
  chunk: string;
  nextIndex: number;
  eol?: boolean;
}

function countDelimiters(line: string, open: string, close: string): number {
  let delta = 0;
  for (const ch of line) {
    if (ch === open) delta++;
    else if (ch === close) delta--;
  }
  return delta;
}

function isRegexStart(line: string, slashIdx: number): boolean {
  const before = line.slice(0, slashIdx).trimEnd();
  return before === '' || /[=([,:!&|?{};]$/.test(before) || /\b(return|case|throw|typeof|void|in|of|await|yield)$/.test(before);
}

function scanDelimited(line: string, start: number, quote: string, isRegex: boolean): { out: string; nextIndex: number } {
  let out = quote;
  let i = start + 1;
  let inClass = false;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      out += '  ';
      i += 2;
      continue;
    }
    if (isRegex && ch === '[') inClass = true;
    else if (isRegex && ch === ']') inClass = false;
    else if (ch === quote && (!isRegex || !inClass)) {
      return { out: out + quote, nextIndex: i + 1 };
    }
    out += ' ';
    i++;
  }
  return { out, nextIndex: i };
}

function advanceBlockComment(line: string, i: number, state: ScanState): ScanStep {
  if (line[i] === '*' && line[i + 1] === '/') {
    state.inBlockComment = false;
    return { chunk: '  ', nextIndex: i + 2 };
  }
  return { chunk: ' ', nextIndex: i + 1 };
}

function advanceTemplateStatic(line: string, i: number, state: ScanState): ScanStep {
  if (line[i] === '\\' && i + 1 < line.length) return { chunk: '  ', nextIndex: i + 2 };
  if (line[i] === '$' && line[i + 1] === '{') {
    state.templateStack[state.templateStack.length - 1] = 1;
    return { chunk: '${', nextIndex: i + 2 };
  }
  if (line[i] === '`') {
    state.templateStack.pop();
    return { chunk: '`', nextIndex: i + 1 };
  }
  return { chunk: ' ', nextIndex: i + 1 };
}

function advanceCodeChar(line: string, i: number, state: ScanState): ScanStep {
  const ch = line[i];
  if (ch === '/' && line[i + 1] === '/') return { chunk: ' '.repeat(line.length - i), nextIndex: line.length, eol: true };
  if (ch === '/' && line[i + 1] === '*') { state.inBlockComment = true; return { chunk: '  ', nextIndex: i + 2 }; }
  if (ch === "'" || ch === '"') { const res = scanDelimited(line, i, ch, false); return { chunk: res.out, nextIndex: res.nextIndex }; }
  if (ch === '`') { state.templateStack.push(0); return { chunk: '`', nextIndex: i + 1 }; }
  if (ch === '/' && isRegexStart(line, i)) { const res = scanDelimited(line, i, '/', true); return { chunk: res.out, nextIndex: res.nextIndex }; }
  if (ch === '{' && state.templateStack.length > 0) state.templateStack[state.templateStack.length - 1]++;
  else if (ch === '}' && state.templateStack.length > 0) state.templateStack[state.templateStack.length - 1]--;
  return { chunk: ch, nextIndex: i + 1 };
}

function endsOpenType(trimmed: string): boolean {
  return /[=|&?:,<([]$/.test(trimmed) || /\bextends$/.test(trimmed);
}

function isContinuationLine(trimmed: string, state: TypeState): boolean {
  return state.braceDepth > 0 || state.bracketDepth > 0 || state.expectingContinuation || /^(\||&|\?|:|extends\b|\)|>|\]|\})/.test(trimmed);
}

function advanceTypeState(trimmed: string, prevBrace: number, prevBracket: number, isStart: boolean): TypeState {
  const nextBrace = Math.max(0, prevBrace + countDelimiters(trimmed, '{', '}'));
  const nextBracket = Math.max(0, prevBracket + countDelimiters(trimmed, '[', ']'));
  const braceClosed = isStart ? trimmed.includes('{') && trimmed.includes('}') : prevBrace > 0 && trimmed.includes('}');
  const bracketClosed = isStart ? trimmed.includes('[') && trimmed.includes(']') : prevBracket > 0 && trimmed.includes(']');
  const openEnded = endsOpenType(trimmed);
  const closed = nextBrace === 0 && nextBracket === 0 && (trimmed.endsWith(';') || ((braceClosed || bracketClosed) && !openEnded));
  return {
    active: !closed,
    braceDepth: closed ? 0 : nextBrace,
    bracketDepth: closed ? 0 : nextBracket,
    expectingContinuation: !closed && openEnded
  };
}

export function maskCodeLine(line: string, state: ScanState): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const inStaticTpl = !state.inBlockComment && state.templateStack[state.templateStack.length - 1] === 0;
    const step = state.inBlockComment
      ? advanceBlockComment(line, i, state)
      : inStaticTpl
        ? advanceTemplateStatic(line, i, state)
        : advanceCodeChar(line, i, state);
    out += step.chunk;
    i = step.nextIndex;
    if (step.eol) break;
  }
  return out;
}

export function isTypeDeclarationLine(maskedLine: string, state: TypeState): { skip: boolean; state: TypeState } {
  const trimmed = maskedLine.trim();
  const idle: TypeState = { active: false, braceDepth: 0, bracketDepth: 0, expectingContinuation: false };
  if (!trimmed || trimmed.startsWith('#')) return { skip: true, state };
  if (state.active && isContinuationLine(trimmed, state)) {
    return { skip: true, state: advanceTypeState(trimmed, state.braceDepth, state.bracketDepth, false) };
  }
  if (/^(export\s+)?(interface|type)\s+[A-Za-z0-9_]/.test(trimmed)) {
    return { skip: true, state: advanceTypeState(trimmed, 0, 0, true) };
  }
  const isSimpleTypeLine = /^import\s+type\b/.test(trimmed) || /:\s*(boolean|string|number|void|any)\s*[;,)]?$/.test(trimmed);
  return { skip: isSimpleTypeLine, state: idle };
}
