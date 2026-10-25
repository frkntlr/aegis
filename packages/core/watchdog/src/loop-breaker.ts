import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LoopBreakerOptions {
  maxFailures?: number;
  persistPath?: string;
  persistToDisk?: boolean;
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

function findRepoRoot(start = process.cwd()): string {
  let cur = path.resolve(start);
  while (cur) {
    if (fs.existsSync(path.join(cur, '.git')) || fs.existsSync(path.join(cur, '.aegis'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

function resolveDefaultPersistPath(): string {
  return path.join(findRepoRoot(), '.aegis', 'loop_breaker.json');
}

export class LoopBreaker {
  private maxFailures: number;
  private persistPath: string;
  private persistToDisk: boolean;
  private failures: Map<number, FailureRecord> = new Map();

  constructor(options: LoopBreakerOptions = {}) {
    this.maxFailures = options.maxFailures ?? 3;
    this.persistToDisk = options.persistToDisk ?? true;
    this.persistPath = options.persistPath ?? resolveDefaultPersistPath();
    this.loadDiskCache();
  }

  private loadDiskCache(): void {
    if (!this.persistToDisk || !fs.existsSync(this.persistPath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
      if (typeof raw === 'object' && raw !== null) {
        for (const [k, v] of Object.entries(raw)) {
          const num = parseInt(k, 10);
          if (!isNaN(num)) this.failures.set(num, v as FailureRecord);
        }
      }
    } catch { /* ignore corrupted disk cache */ }
  }

  private saveDiskCache(): void {
    if (!this.persistToDisk) return;
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<number, FailureRecord> = {};
      for (const [k, v] of this.failures.entries()) obj[k] = v;
      fs.writeFileSync(this.persistPath, JSON.stringify(obj, null, 2), 'utf8');
    } catch { /* ignore disk write errors */ }
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
      this.saveDiskCache();
      return {
        blocked: true,
        attempts: existing.attempts,
        maxFailures: this.maxFailures,
        reason: `Repeated failure threshold reached (${existing.attempts}/${this.maxFailures}): ${errorMessage}`
      };
    }

    this.failures.set(issueNumber, existing);
    this.saveDiskCache();
    return {
      blocked: false,
      attempts: existing.attempts,
      maxFailures: this.maxFailures
    };
  }

  public recordSuccess(issueNumber: number): void {
    this.failures.delete(issueNumber);
    this.saveDiskCache();
  }

  public unblock(issueNumber: number): boolean {
    const rec = this.failures.get(issueNumber);
    if (!rec) return false;
    rec.blocked = false;
    rec.attempts = 0;
    this.failures.set(issueNumber, rec);
    this.saveDiskCache();
    return true;
  }

  public isBlocked(issueNumber: number): boolean {
    return this.failures.get(issueNumber)?.blocked ?? false;
  }

  public getBlockedIssues(): number[] {
    const blocked: number[] = [];
    for (const [num, record] of this.failures.entries()) {
      if (record.blocked) blocked.push(num);
    }
    return blocked;
  }

  public getAllRecords(): Map<number, FailureRecord> {
    return new Map(this.failures);
  }

  public getRecord(issueNumber: number): FailureRecord | undefined {
    return this.failures.get(issueNumber);
  }

  public reset(issueNumber?: number): void {
    if (issueNumber !== undefined) {
      this.failures.delete(issueNumber);
    } else {
      this.failures.clear();
    }
    this.saveDiskCache();
  }
}
