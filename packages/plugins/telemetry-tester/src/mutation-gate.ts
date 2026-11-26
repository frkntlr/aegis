export interface Mutant {
  id: string;
  originalOp: string;
  mutatedOp: string;
  line: number;
  mutatedCode: string;
}

export interface MutationScoreReport {
  totalMutants: number;
  killedMutants: number;
  survivedMutants: number;
  scorePercent: number;
  passedThreshold: boolean;
  minThresholdPercent: number;
}

interface TypeState {
  active: boolean;
  braceDepth: number;
  bracketDepth: number;
  expectingContinuation: boolean;
}

interface ScanState {
  inBlockComment: boolean;
  templateStack: number[];
}

interface ApplyRulesOptions {
  lines: string[];
  lineIndex: number;
  line: string;
  masked: string;
  mutants: Mutant[];
  eol?: string;
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

export class MutationGate {
  private readonly minThresholdPercent: number;
  private readonly mutationRules: Array<{ pattern: RegExp; replacement: string; desc: string }> = [
    // Arithmetic
    { pattern: /\s\+\s/, replacement: ' - ', desc: '+ to -' },
    { pattern: /\s-\s/, replacement: ' + ', desc: '- to +' },
    // Boundaries (#215)
    { pattern: /\s>=\s/, replacement: ' < ', desc: '>= to <' },
    { pattern: /\s<=\s/, replacement: ' > ', desc: '<= to >' },
    { pattern: /\s>\s/, replacement: ' <= ', desc: '> to <=' },
    { pattern: /\s<\s/, replacement: ' >= ', desc: '< to >=' },
    // Equality
    { pattern: /\s===\s/, replacement: ' !== ', desc: '=== to !==' },
    { pattern: /\s!==\s/, replacement: ' === ', desc: '!== to ===' },
    // Logical (#215)
    { pattern: /\s&&\s/, replacement: ' || ', desc: '&& to ||' },
    { pattern: /\s\|\|\s/, replacement: ' && ', desc: '|| to &&' },
    // Booleans & Returns (#215)
    { pattern: /\breturn\s+true\b/, replacement: 'return false', desc: 'return true to return false' },
    { pattern: /\breturn\s+false\b/, replacement: 'return true', desc: 'return false to return true' },
    { pattern: /\btrue\b/, replacement: 'false', desc: 'true to false' },
    { pattern: /\bfalse\b/, replacement: 'true', desc: 'false to true' }
  ];

  constructor(options: { minThresholdPercent?: number } = {}) {
    this.minThresholdPercent = options.minThresholdPercent ?? 70;
  }

  private maskCodeLine(line: string, state: ScanState): string {
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

  private isTypeDeclarationLine(maskedLine: string, state: TypeState): { skip: boolean; state: TypeState } {
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

  public generateMutants(sourceCode: string): Mutant[] {
    const mutants: Mutant[] = [];
    const eol = sourceCode.includes('\r\n') ? '\r\n' : '\n';
    const lines = sourceCode.split(/\r?\n/);
    let typeState: TypeState = { active: false, braceDepth: 0, bracketDepth: 0, expectingContinuation: false };
    const scanState: ScanState = { inBlockComment: false, templateStack: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const masked = this.maskCodeLine(line, scanState);
      const check = this.isTypeDeclarationLine(masked, typeState);
      typeState = check.state;
      if (check.skip) continue;

      this.applyRulesToLine({ lines, lineIndex: i, line, masked, mutants, eol });
    }

    return mutants;
  }

  private applyRulesToLine(opts: ApplyRulesOptions): void {
    const { lines, lineIndex, line, masked, mutants, eol = '\n' } = opts;
    const seenMutatedLines = new Set<string>();
    for (const rule of this.mutationRules) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(masked);
      if (!match) continue;
      const mutatedLine = line.slice(0, match.index) + rule.replacement + line.slice(match.index + match[0].length);
      if (seenMutatedLines.has(mutatedLine)) continue;
      seenMutatedLines.add(mutatedLine);
      const copy = [...lines];
      copy[lineIndex] = mutatedLine;
      mutants.push({
        id: `mutant-${lineIndex + 1}-${rule.desc}`,
        originalOp: rule.pattern.source,
        mutatedOp: rule.replacement,
        line: lineIndex + 1,
        mutatedCode: copy.join(eol)
      });
    }
  }

  public evaluateScore(
    mutants: Mutant[],
    testRunner: (mutant: Mutant) => boolean
  ): MutationScoreReport {
    if (mutants.length === 0) {
      return {
        totalMutants: 0,
        killedMutants: 0,
        survivedMutants: 0,
        scorePercent: 100,
        passedThreshold: true,
        minThresholdPercent: this.minThresholdPercent
      };
    }

    let killed = 0;
    for (const mutant of mutants) {
      if (testRunner(mutant)) {
        killed++;
      }
    }

    const survived = mutants.length - killed;
    const scorePercent = Math.round((killed / mutants.length) * 100);
    const passedThreshold = scorePercent >= this.minThresholdPercent;

    return {
      totalMutants: mutants.length,
      killedMutants: killed,
      survivedMutants: survived,
      scorePercent,
      passedThreshold,
      minThresholdPercent: this.minThresholdPercent
    };
  }
}
