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
    { pattern: /\s\+\s/, replacement: ' - ', desc: '+ to -' },
    { pattern: /\s===\s/, replacement: ' !== ', desc: '=== to !==' },
    { pattern: /\s>\s/, replacement: ' <= ', desc: '> to <=' },
    { pattern: /\btrue\b/, replacement: 'false', desc: 'true to false' }
  ];

  constructor(options: { minThresholdPercent?: number } = {}) {
    this.minThresholdPercent = options.minThresholdPercent ?? 70;
  }

  public generateMutants(sourceCode: string): Mutant[] {
    const mutants: Mutant[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
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

    return mutants;
  }

  public evaluateScore(
    mutants: Mutant[],
    testRunner: (mutant: Mutant) => boolean // returns true if test fails (mutant killed)
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
      const testFailedOnMutant = testRunner(mutant);
      if (testFailedOnMutant) {
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
