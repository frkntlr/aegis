export interface StepMetric {
  step: number;
  changedFilesCount: number;
  diffLinesCount: number;
  failingTestsCount: number;
  checkpointHash?: string;
  timestamp: string;
}

export interface CompoundingAlert {
  alert: 'COMPOUNDING_ERROR' | 'RUNAWAY_DIFF' | 'TEST_REGRESSION';
  currentStep: number;
  recommendedRollbackStep?: number;
  reason: string;
}

export class CompoundingErrorChecker {
  private history: StepMetric[] = [];
  private readonly maxGrowthMultiplier: number;

  constructor(options: { maxGrowthMultiplier?: number } = {}) {
    this.maxGrowthMultiplier = options.maxGrowthMultiplier ?? 2.5;
  }

  public recordStep(metric: StepMetric): CompoundingAlert | null {
    this.history.push(metric);
    const len = this.history.length;
    if (len < 3) return null;

    const current = this.history[len - 1];
    const prev1 = this.history[len - 2];
    const prev2 = this.history[len - 3];

    // Check 1: Exponential Diff Growth over 3 consecutive steps
    const isDiffGrowing = current.diffLinesCount > (prev1.diffLinesCount * this.maxGrowthMultiplier) &&
                          prev1.diffLinesCount > (prev2.diffLinesCount * 1.5);

    if (isDiffGrowing && current.diffLinesCount > 60) {
      return {
        alert: 'RUNAWAY_DIFF',
        currentStep: current.step,
        recommendedRollbackStep: prev2.step,
        reason: `Diff lines increased exponentially (${prev2.diffLinesCount} -> ${prev1.diffLinesCount} -> ${current.diffLinesCount} lines). Cascade error detected.`
      };
    }

    // Check 2: Cascading test failures (increasing fail count across 3 turns)
    if (current.failingTestsCount > prev1.failingTestsCount &&
        prev1.failingTestsCount > prev2.failingTestsCount) {
      return {
        alert: 'TEST_REGRESSION',
        currentStep: current.step,
        recommendedRollbackStep: prev2.step,
        reason: `Failing tests escalated continuously (${prev2.failingTestsCount} -> ${prev1.failingTestsCount} -> ${current.failingTestsCount}). Rolling back to clean state is advised.`
      };
    }

    return null;
  }

  public getHistory(): StepMetric[] {
    return [...this.history];
  }
}
