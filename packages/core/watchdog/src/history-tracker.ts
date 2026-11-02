import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeAegisDir, type ExecutionHistoryRecord } from '@aegis/shared';

export class HistoryTracker {
  private historyFilePath: string;
  private records: Map<string, ExecutionHistoryRecord> = new Map();

  constructor(filePath?: string) {
    this.historyFilePath = filePath ?? path.join(resolveSafeAegisDir(), 'history.json');
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
        lastUpdated: new Date().toISOString(),
        recentDurationsMs: [durationMs]
      });
    } else {
      const recent = [...(existing.recentDurationsMs ?? [existing.p95DurationMs]), durationMs];
      if (recent.length > 100) {
        recent.shift();
      }
      const sorted = [...recent].sort((a, b) => a - b);
      const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
      const newP95 = sorted[p95Index];
      const newCount = existing.runCount + 1;
      const newAvg = ((existing.avgDurationMs * existing.runCount) + durationMs) / newCount;

      this.records.set(modulePath, {
        modulePath,
        avgDurationMs: Math.round(newAvg),
        p95DurationMs: Math.round(newP95),
        runCount: newCount,
        lastUpdated: new Date().toISOString(),
        recentDurationsMs: recent
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
      const dir = path.dirname(this.historyFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.historyFilePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
      try {
        fs.renameSync(tmp, this.historyFilePath);
      } catch {
        fs.copyFileSync(tmp, this.historyFilePath);
        try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      }
    } catch {
      // non-fatal
    }
  }
}
