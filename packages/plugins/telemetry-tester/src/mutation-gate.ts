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

  private isTypeDeclarationLine(line: string, inTypeBlock: boolean): { skip: boolean; inTypeBlock: boolean } {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return { skip: true, inTypeBlock };
    }
    // Detect type and interface definitions to avoid invalid mutant syntax (#214)
    if (/^(export\s+)?(interface|type)\s+[A-Za-z0-9_]/.test(trimmed)) {
      const endsOnSameLine = trimmed.includes(';') || (trimmed.includes('{') && trimmed.includes('}'));
      return { skip: true, inTypeBlock: !endsOnSameLine };
    }
    if (inTypeBlock) {
      const closed = trimmed.includes('}');
      return { skip: true, inTypeBlock: !closed };
    }
    // Skip import type statements and pure type casts
    if (/^import\s+type\b/.test(trimmed) || /:\s*(boolean|string|number|void|any)\s*[;,)]?$/.test(trimmed)) {
      return { skip: true, inTypeBlock: false };
    }
    return { skip: false, inTypeBlock: false };
  }

  public generateMutants(sourceCode: string): Mutant[] {
    const mutants: Mutant[] = [];
    const lines = sourceCode.split('\n');
    let inTypeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const check = this.isTypeDeclarationLine(line, inTypeBlock);
      inTypeBlock = check.inTypeBlock;
      if (check.skip) continue;

      this.applyRulesToLine(lines, i, line, mutants);
    }

    return mutants;
  }

  private applyRulesToLine(lines: string[], i: number, line: string, mutants: Mutant[]): void {
    for (const rule of this.mutationRules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        rule.pattern.lastIndex = 0;
        const mutatedLine = line.replace(rule.pattern, rule.replacement);
        const copy = [...lines];
        copy[i] = mutatedLine;
        mutants.push({
          id: `mutant-${i + 1}-${rule.desc}`,
          originalOp: rule.pattern.source,
          mutatedOp: rule.replacement,
          line: i + 1,
          mutatedCode: copy.join('\n')
        });
      }
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
