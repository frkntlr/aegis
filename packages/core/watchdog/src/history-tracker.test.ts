import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { HistoryTracker } from './history-tracker.js';

test('HistoryTracker calculates true p95 over sliding window rather than p100', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-history-'));
  const tmpFile = path.join(tmpDir, 'history.json');

  try {
    const tracker = new HistoryTracker(tmpFile);
    const mod = 'pkg/test-module';

    // Record 20 runs: nineteen 100ms runs and one 10000ms outlier
    for (let i = 0; i < 19; i++) {
      tracker.recordRun(mod, 100);
    }
    tracker.recordRun(mod, 10000);

    const recWithOutlier = tracker.getRecord(mod);
    assert.ok(recWithOutlier);
    // In 20 items, index = ceil(20 * 0.95) - 1 = 19 - 1 = 18. Sorted[18] is 100!
    assert.strictEqual(recWithOutlier.p95DurationMs, 100);

    // After 100 subsequent 100ms runs, the outlier slides completely out of window
    for (let i = 0; i < 100; i++) {
      tracker.recordRun(mod, 100);
    }
    const recAfterSliding = tracker.getRecord(mod);
    assert.ok(recAfterSliding);
    assert.strictEqual(recAfterSliding.p95DurationMs, 100);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
