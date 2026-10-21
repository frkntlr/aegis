import type { ChildProcess } from 'node:child_process';
import type { ProcessRunMetrics } from '@aegis/shared';

export interface HeartbeatOptions {
  stagnationThresholdMs?: number;
  extensionStepMs?: number;
}

export class HeartbeatMonitor {
  private stagnationThresholdMs: number;
  private extensionStepMs: number;

  constructor(options: HeartbeatOptions = {}) {
    this.stagnationThresholdMs = options.stagnationThresholdMs ?? 60_000;
    this.extensionStepMs = options.extensionStepMs ?? 30_000;
  }

  public async monitor(
    child: ChildProcess,
    timeoutSeconds: number,
    onProgress?: (msg: string) => void
  ): Promise<ProcessRunMetrics> {
    const startTimeMs = Date.now();
    let currentDeadlineMs = startTimeMs + (timeoutSeconds * 1000);
    let lastActivityTimeMs = Date.now();
    let stdoutLinesCount = 0;
    let stderrLinesCount = 0;
    let timedOut = false;
    let stagnated = false;

    return new Promise((resolve) => {
      const handleData = (isStderr: boolean, chunk: Buffer | string) => {
        lastActivityTimeMs = Date.now();
        const lines = chunk.toString().split('\n').length;
        if (isStderr) {
          stderrLinesCount += lines;
        } else {
          stdoutLinesCount += lines;
        }

        // Active output detected near deadline: stretch deadline
        const now = Date.now();
        if (currentDeadlineMs - now < 15_000) {
          currentDeadlineMs += this.extensionStepMs;
          if (onProgress) {
            onProgress(`[Aegis Watchdog] Output streaming detected. Extended deadline by ${this.extensionStepMs / 1000}s`);
          }
        }
      };

      child.stdout?.on('data', (d) => handleData(false, d));
      child.stderr?.on('data', (d) => handleData(true, d));

      const interval = setInterval(() => {
        const now = Date.now();
        const timeSinceActivity = now - lastActivityTimeMs;

        // Condition 1: Stagnation (complete silence)
        if (timeSinceActivity > this.stagnationThresholdMs && child.exitCode === null) {
          stagnated = true;
          clearInterval(interval);
          if (onProgress) {
            onProgress(`[Aegis Watchdog] Stagnation detected (${timeSinceActivity / 1000}s silence). Terminating process.`);
          }
          child.kill('SIGTERM');
        }

        // Condition 2: Absolute deadline exceeded
        if (now > currentDeadlineMs && child.exitCode === null) {
          timedOut = true;
          clearInterval(interval);
          if (onProgress) {
            onProgress(`[Aegis Watchdog] Dynamic timeout limit reached (${timeoutSeconds}s). Hard killing process.`);
          }
          child.kill('SIGKILL');
        }
      }, 1000);

      child.on('close', (exitCode) => {
        clearInterval(interval);
        const endTimeMs = Date.now();
        resolve({
          startTimeMs,
          endTimeMs,
          durationMs: endTimeMs - startTimeMs,
          exitCode,
          timedOut,
          stagnated,
          stdoutLinesCount,
          stderrLinesCount
        });
      });
    });
  }
}
