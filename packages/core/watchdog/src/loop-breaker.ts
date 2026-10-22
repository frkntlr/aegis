export interface LoopBreakerOptions {
  maxFailures?: number;
}

export interface FailureRecord {
  attempts: number;
  lastError: string;
  firstFailedAt: number;
  lastFailedAt: number;
  blocked: boolean;
}

export interface FailureEvaluation {
  blocked: boolean;
  attempts: number;
  maxFailures: number;
  reason?: string;
}

export class LoopBreaker {
  private maxFailures: number;
  private failures: Map<number, FailureRecord> = new Map();

  constructor(options: LoopBreakerOptions = {}) {
    this.maxFailures = options.maxFailures ?? 3;
  }

  public recordFailure(issueNumber: number, errorMessage: string): FailureEvaluation {
    const existing = this.failures.get(issueNumber) ?? {
      attempts: 0,
      lastError: '',
      firstFailedAt: Date.now(),
      lastFailedAt: Date.now(),
      blocked: false
    };

    existing.attempts += 1;
    existing.lastError = errorMessage;
    existing.lastFailedAt = Date.now();

    if (existing.attempts >= this.maxFailures) {
      existing.blocked = true;
      this.failures.set(issueNumber, existing);
      return {
        blocked: true,
        attempts: existing.attempts,
        maxFailures: this.maxFailures,
        reason: `Repeated failure threshold reached (${existing.attempts}/${this.maxFailures}): ${errorMessage}`
      };
    }

    this.failures.set(issueNumber, existing);
    return {
      blocked: false,
      attempts: existing.attempts,
      maxFailures: this.maxFailures
    };
  }

  public recordSuccess(issueNumber: number): void {
    this.failures.delete(issueNumber);
  }

  public isBlocked(issueNumber: number): boolean {
    return this.failures.get(issueNumber)?.blocked ?? false;
  }

  public getRecord(issueNumber: number): FailureRecord | undefined {
    return this.failures.get(issueNumber);
  }

  public reset(issueNumber: number): void {
    this.failures.delete(issueNumber);
  }
}
