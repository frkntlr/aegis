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

  private countBraces(line: string): number {
    let delta = 0;
    for (const ch of line) {
      if (ch === '{') delta++;
      else if (ch === '}') delta--;
    }
    return delta;
  }

  private countBrackets(line: string): number {
    let delta = 0;
    for (const ch of line) {
      if (ch === '[') delta++;
      else if (ch === ']') delta--;
    }
    return delta;
  }

  private isRegexStart(line: string, slashIdx: number): boolean {
    const before = line.slice(0, slashIdx).trimEnd();
    return before === '' || /[=([,:!&|?{};]$/.test(before) || /\b(return|case|throw|typeof|void|in|of|await|yield)$/.test(before);
  }

  private scanDelimited(line: string, start: number, quote: string, isRegex: boolean): { out: string; nextIndex: number } {
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

  private maskCodeLine(line: string, state: ScanState): string {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (state.inBlockComment) {
        if (line[i] === '*' && line[i + 1] === '/') {
          state.inBlockComment = false;
          out += '  ';
          i += 2;
        } else {
          out += ' ';
          i++;
        }
        continue;
      }
      const inStaticTpl = state.templateStack.length > 0 && state.templateStack[state.templateStack.length - 1] === 0;
      if (inStaticTpl) {
        if (line[i] === '\\' && i + 1 < line.length) { out += '  '; i += 2; }
        else if (line[i] === '$' && line[i + 1] === '{') { state.templateStack[state.templateStack.length - 1] = 1; out += '${'; i += 2; }
        else if (line[i] === '`') { state.templateStack.pop(); out += '`'; i++; }
        else { out += ' '; i++; }
        continue;
      }
      const ch = line[i];
      if (ch === '/' && line[i + 1] === '/') return out + ' '.repeat(line.length - i);
      if (ch === '/' && line[i + 1] === '*') { state.inBlockComment = true; out += '  '; i += 2; continue; }
      if (ch === "'" || ch === '"') { const res = this.scanDelimited(line, i, ch, false); out += res.out; i = res.nextIndex; continue; }
      if (ch === '`') { state.templateStack.push(0); out += '`'; i++; continue; }
      if (ch === '/' && this.isRegexStart(line, i)) { const res = this.scanDelimited(line, i, '/', true); out += res.out; i = res.nextIndex; continue; }
      if (ch === '{' && state.templateStack.length > 0) state.templateStack[state.templateStack.length - 1]++;
      else if (ch === '}' && state.templateStack.length > 0) state.templateStack[state.templateStack.length - 1]--;
      out += ch;
      i++;
    }
    return out;
  }

  private endsOpenType(trimmed: string): boolean {
    return /[=|&?:,<([]$/.test(trimmed) || /\bextends$/.test(trimmed);
  }

  private isTypeDeclarationLine(maskedLine: string, state: TypeState): { skip: boolean; state: TypeState } {
    const trimmed = maskedLine.trim();
    const idle: TypeState = { active: false, braceDepth: 0, bracketDepth: 0, expectingContinuation: false };
    if (!trimmed || trimmed.startsWith('#')) return { skip: true, state };
    if (state.active) {
      const continues = state.braceDepth > 0 || state.bracketDepth > 0 || state.expectingContinuation || /^(\||&|\?|:|extends\b|\)|>|\]|\})/.test(trimmed);
      if (continues) {
        const nextBrace = Math.max(0, state.braceDepth + this.countBraces(trimmed));
        const nextBracket = Math.max(0, state.bracketDepth + this.countBrackets(trimmed));
        const hasClose = (state.braceDepth > 0 && trimmed.includes('}')) || (state.bracketDepth > 0 && trimmed.includes(']'));
        const closed = nextBrace === 0 && nextBracket === 0 && (trimmed.endsWith(';') || (hasClose && !this.endsOpenType(trimmed)));
        return { skip: true, state: { active: !closed, braceDepth: closed ? 0 : nextBrace, bracketDepth: closed ? 0 : nextBracket, expectingContinuation: !closed && this.endsOpenType(trimmed) } };
      }
    }
    if (/^(export\s+)?(interface|type)\s+[A-Za-z0-9_]/.test(trimmed)) {
      const braceDepth = Math.max(0, this.countBraces(trimmed));
      const bracketDepth = Math.max(0, this.countBrackets(trimmed));
      const hasInline = (trimmed.includes('{') && trimmed.includes('}')) || (trimmed.includes('[') && trimmed.includes(']'));
      const endsOnSameLine = braceDepth === 0 && bracketDepth === 0 && (trimmed.endsWith(';') || (hasInline && !this.endsOpenType(trimmed)));
      return { skip: true, state: { active: !endsOnSameLine, braceDepth: endsOnSameLine ? 0 : braceDepth, bracketDepth: endsOnSameLine ? 0 : bracketDepth, expectingContinuation: !endsOnSameLine && this.endsOpenType(trimmed) } };
    }
    if (/^import\s+type\b/.test(trimmed) || /:\s*(boolean|string|number|void|any)\s*[;,)]?$/.test(trimmed)) {
      return { skip: true, state: idle };
    }
    return { skip: false, state: idle };
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

      this.applyRulesToLine(lines, i, line, masked, mutants, eol);
    }

    return mutants;
  }

  private applyRulesToLine(lines: string[], i: number, line: string, masked: string, mutants: Mutant[], eol = '\n'): void {
    const seenMutatedLines = new Set<string>();
    for (const rule of this.mutationRules) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(masked);
      if (!match) continue;
      const mutatedLine = line.slice(0, match.index) + rule.replacement + line.slice(match.index + match[0].length);
      if (seenMutatedLines.has(mutatedLine)) continue;
      seenMutatedLines.add(mutatedLine);
      const copy = [...lines];
      copy[i] = mutatedLine;
      mutants.push({
        id: `mutant-${i + 1}-${rule.desc}`,
        originalOp: rule.pattern.source,
        mutatedOp: rule.replacement,
        line: i + 1,
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
