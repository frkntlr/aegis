import { type ScanState, type TypeState, isTypeDeclarationLine, maskCodeLine } from './mutation-scanner.js';

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

interface ApplyRulesOptions {
  lines: string[];
  lineIndex: number;
  line: string;
  masked: string;
  mutants: Mutant[];
  eol?: string;
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

  public generateMutants(sourceCode: string): Mutant[] {
    const mutants: Mutant[] = [];
    const eol = sourceCode.includes('\r\n') ? '\r\n' : '\n';
    const lines = sourceCode.split(/\r?\n/);
    let typeState: TypeState = { active: false, braceDepth: 0, bracketDepth: 0, expectingContinuation: false };
    const scanState: ScanState = { inBlockComment: false, templateStack: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const masked = maskCodeLine(line, scanState);
      const check = isTypeDeclarationLine(masked, typeState);
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
