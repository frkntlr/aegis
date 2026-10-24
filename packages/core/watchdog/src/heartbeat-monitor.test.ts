import { test } from 'node:test';
import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { HeartbeatMonitor } from './heartbeat-monitor.js';
import type { ChildProcess } from 'node:child_process';

class MockChildProcess extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public exitCode: number | null = null;
  public pid = 99999;
  public killedSignal: string | null = null;

  public kill(signal?: NodeJS.Signals | number): boolean {
    this.killedSignal = String(signal);
    this.exitCode = 1;
    this.emit('close', 1);
    return true;
  }
}

test('HeartbeatMonitor records metrics for cleanly completing process', async () => {
  const monitor = new HeartbeatMonitor({ stagnationThresholdMs: 5000 });
  const child = new MockChildProcess() as unknown as ChildProcess;

  const monitorPromise = monitor.monitor(child, 10);
  (child as unknown as MockChildProcess).stdout.emit('data', Buffer.from('hello\nworld\n'));
  (child as unknown as MockChildProcess).stderr.emit('data', Buffer.from('warn\n'));

  setTimeout(() => {
    (child as unknown as MockChildProcess).exitCode = 0;
    (child as unknown as MockChildProcess).emit('close', 0);
  }, 50);

  const metrics = await monitorPromise;
  assert.strictEqual(metrics.timedOut, false);
  assert.strictEqual(metrics.stagnated, false);
  assert.strictEqual(metrics.exitCode, 0);
  assert.strictEqual(metrics.stdoutLinesCount >= 2, true);
  assert.strictEqual(metrics.stderrLinesCount >= 1, true);
  assert.strictEqual(metrics.durationMs >= 40, true);
});

test('HeartbeatMonitor triggers stagnation termination when process is silent', async () => {
  const monitor = new HeartbeatMonitor({ stagnationThresholdMs: 60 });
  const child = new MockChildProcess() as unknown as ChildProcess;
  const progressLogs: string[] = [];

  const monitorPromise = monitor.monitor(child, 10, (msg) => progressLogs.push(msg));

  const metrics = await monitorPromise;
  assert.strictEqual(metrics.stagnated, true);
  assert.strictEqual(metrics.timedOut, false);
  assert.strictEqual((child as unknown as MockChildProcess).killedSignal, 'SIGTERM');
  assert.ok(progressLogs.some(log => log.includes('Stagnation detected')));
});

test('HeartbeatMonitor triggers dynamic timeout when deadline exceeded', async () => {
  const monitor = new HeartbeatMonitor({ stagnationThresholdMs: 5000 });
  const child = new MockChildProcess() as unknown as ChildProcess;
  const progressLogs: string[] = [];

  // Timeout set to 0.05 seconds (50ms), stagnation is 5000ms
  const monitorPromise = monitor.monitor(child, 0.05, (msg) => progressLogs.push(msg));

  const metrics = await monitorPromise;
  assert.strictEqual(metrics.timedOut, true);
  assert.strictEqual(metrics.stagnated, false);
  assert.strictEqual((child as unknown as MockChildProcess).killedSignal, 'SIGKILL');
  assert.ok(progressLogs.some(log => log.includes('Dynamic timeout limit reached')));
});
