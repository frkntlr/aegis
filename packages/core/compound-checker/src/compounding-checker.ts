export interface StepMetric {
  step: number;
  changedFilesCount: number;
  diffLinesCount: number;
  failingTestsCount: number;
  failingTestNames?: string[];
  checkpointHash?: string;
  timestamp: string;
}

export interface CompoundingAlert {
  alert: 'COMPOUNDING_ERROR' | 'RUNAWAY_DIFF' | 'TEST_REGRESSION' | 'RUNAWAY_FILE_CHURN' | 'COMPOUNDING_LOOP';
  currentStep: number;
  recommendedRollbackStep?: number;
  reason: string;
  loopingTests?: string[];
}

export class CompoundingErrorChecker {
  private history: StepMetric[] = [];
  private readonly maxGrowthMultiplier: number;

  constructor(options: { maxGrowthMultiplier?: number } = {}) {
    this.maxGrowthMultiplier = options.maxGrowthMultiplier ?? 2.5;
  }

  private createAlert(
    alert: CompoundingAlert['alert'],
    step: number,
    rollbackStep: number,
    reason: string,
    loopingTests?: string[]
  ): CompoundingAlert {
    return { alert, currentStep: step, recommendedRollbackStep: rollbackStep, reason, loopingTests };
  }

  private checkLoopingTests(current: StepMetric, prev1: StepMetric, prev2: StepMetric): CompoundingAlert | null {
    if (!current.failingTestNames || !prev1.failingTestNames || !prev2.failingTestNames) {
      return null;
    }
    const set1 = new Set(prev1.failingTestNames);
    const set2 = new Set(prev2.failingTestNames);
    const looping = current.failingTestNames.filter(t => set1.has(t) && set2.has(t));
    if (looping.length > 0) {
      const msg = `Compounding error loop: test(s) [${looping.join(', ')}] failed across 3 consecutive iterations with expanding edits.`;
      return this.createAlert('COMPOUNDING_LOOP', current.step, prev2.step, msg, looping);
    }
    return null;
  }

  private checkEscalationAlerts(current: StepMetric, prev1: StepMetric, prev2: StepMetric): CompoundingAlert | null {
    const isDiffGrowing = prev2.diffLinesCount > 0 &&
      current.diffLinesCount > (prev1.diffLinesCount * this.maxGrowthMultiplier) &&
      prev1.diffLinesCount > (prev2.diffLinesCount * 1.5);

    const isTestRegression = current.failingTestsCount > prev1.failingTestsCount &&
      prev1.failingTestsCount >= prev2.failingTestsCount &&
      current.failingTestsCount > 0;

    const isFileChurnGrowing = prev2.changedFilesCount > 0 &&
      current.changedFilesCount >= (prev1.changedFilesCount * 2) &&
      prev1.changedFilesCount > prev2.changedFilesCount &&
      current.changedFilesCount >= 8;

    if (isDiffGrowing && isTestRegression) {
      return this.createAlert('COMPOUNDING_ERROR', current.step, prev2.step, 'Compounding error: runaway diff and cascading test failures.');
    }
    if (isDiffGrowing && current.diffLinesCount > 60) {
      const msg = `Diff lines increased exponentially (${prev2.diffLinesCount} -> ${prev1.diffLinesCount} -> ${current.diffLinesCount} lines). Cascade error detected.`;
      return this.createAlert('RUNAWAY_DIFF', current.step, prev2.step, msg);
    }
    if (isTestRegression) {
      const msg = `Failing tests escalated continuously (${prev2.failingTestsCount} -> ${prev1.failingTestsCount} -> ${current.failingTestsCount}). Rolling back to clean state is advised.`;
      return this.createAlert('TEST_REGRESSION', current.step, prev2.step, msg);
    }
    if (isFileChurnGrowing) {
      const msg = `Changed files escalated exponentially (${prev2.changedFilesCount} -> ${prev1.changedFilesCount} -> ${current.changedFilesCount}). Multi-file churn detected.`;
      return this.createAlert('RUNAWAY_FILE_CHURN', current.step, prev2.step, msg);
    }
    return null;
  }

  public recordStep(metric: StepMetric): CompoundingAlert | null {
    this.history.push(metric);
    const len = this.history.length;
    if (len < 3) return null;

    const current = this.history[len - 1];
    const prev1 = this.history[len - 2];
    const prev2 = this.history[len - 3];

    // Check specific looping tests first (#201)
    const loopAlert = this.checkLoopingTests(current, prev1, prev2);
    if (loopAlert) return loopAlert;

    return this.checkEscalationAlerts(current, prev1, prev2);
  }

  public getHistory(): StepMetric[] {
    return [...this.history];
  }
}
