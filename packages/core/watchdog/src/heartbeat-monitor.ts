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

  private checkWatchdogTimer(
    child: ChildProcess,
    lastActivityTimeMs: number,
    currentDeadlineMs: number,
    timeoutSeconds: number,
    interval: NodeJS.Timeout,
    flags: { stagnated: boolean; timedOut: boolean },
    onProgress?: (msg: string) => void
  ): void {
    const now = Date.now();
    const timeSinceActivity = now - lastActivityTimeMs;

    if (timeSinceActivity > this.stagnationThresholdMs && child.exitCode === null) {
      flags.stagnated = true;
      clearInterval(interval);
      if (onProgress) onProgress(`[Aegis Watchdog] Stagnation detected (${timeSinceActivity / 1000}s silence). Terminating.`);
      child.kill('SIGTERM');
    }

    if (now > currentDeadlineMs && child.exitCode === null) {
      flags.timedOut = true;
      clearInterval(interval);
      if (onProgress) onProgress(`[Aegis Watchdog] Dynamic timeout limit reached (${timeoutSeconds}s). Hard killing process.`);
      child.kill('SIGKILL');
    }
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
    const flags = { timedOut: false, stagnated: false };

    return new Promise((resolve) => {
      const handleData = (isStderr: boolean, chunk: Buffer | string) => {
        lastActivityTimeMs = Date.now();
        const lines = chunk.toString().split('\n').length;
        if (isStderr) stderrLinesCount += lines;
        else stdoutLinesCount += lines;

        const now = Date.now();
        if (currentDeadlineMs - now < 15_000) {
          currentDeadlineMs += this.extensionStepMs;
          if (onProgress) onProgress(`[Aegis Watchdog] Output streaming detected. Extended deadline by ${this.extensionStepMs / 1000}s`);
        }
      };

      child.stdout?.on('data', (d) => handleData(false, d));
      child.stderr?.on('data', (d) => handleData(true, d));

      const interval = setInterval(() => {
        this.checkWatchdogTimer(child, lastActivityTimeMs, currentDeadlineMs, timeoutSeconds, interval, flags, onProgress);
      }, 1000);

      child.on('close', (exitCode) => {
        clearInterval(interval);
        const endTimeMs = Date.now();
        resolve({
          startTimeMs,
          endTimeMs,
          durationMs: endTimeMs - startTimeMs,
          timedOut: flags.timedOut,
          stagnated: flags.stagnated,
          exitCode,
          stdoutLinesCount,
          stderrLinesCount
        });
      });
    });
  }
}
