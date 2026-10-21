import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExecutionHistoryRecord } from '@aegis/shared';

export class HistoryTracker {
  private historyFilePath: string;
  private records: Map<string, ExecutionHistoryRecord> = new Map();

  constructor(filePath?: string) {
    this.historyFilePath = filePath ?? path.resolve(process.cwd(), '.aegis-history.json');
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.historyFilePath)) {
      try {
        const raw = fs.readFileSync(this.historyFilePath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, ExecutionHistoryRecord>;
        for (const [k, v] of Object.entries(parsed)) {
          this.records.set(k, v);
        }
      } catch {
        // ignore invalid file
      }
    }
  }

  public getRecord(modulePath: string): ExecutionHistoryRecord | undefined {
    return this.records.get(modulePath);
  }

  public recordRun(modulePath: string, durationMs: number): void {
    const existing = this.records.get(modulePath);
    if (!existing) {
      this.records.set(modulePath, {
        modulePath,
        avgDurationMs: durationMs,
        p95DurationMs: durationMs,
        runCount: 1,
        lastUpdated: new Date().toISOString()
      });
    } else {
      const newCount = existing.runCount + 1;
      const newAvg = ((existing.avgDurationMs * existing.runCount) + durationMs) / newCount;
      const newP95 = Math.max(existing.p95DurationMs, durationMs);
      this.records.set(modulePath, {
        modulePath,
        avgDurationMs: Math.round(newAvg),
        p95DurationMs: Math.round(newP95),
        runCount: newCount,
        lastUpdated: new Date().toISOString()
      });
    }
    this.persist();
  }

  private persist(): void {
    try {
      const obj: Record<string, ExecutionHistoryRecord> = {};
      for (const [k, v] of this.records.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.historyFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch {
      // non-fatal
    }
  }
}
