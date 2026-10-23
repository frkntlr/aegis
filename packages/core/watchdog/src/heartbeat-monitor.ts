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

  private setupDataListeners(
    child: ChildProcess,
    state: { lastActivityTimeMs: number; stdoutLinesCount: number; stderrLinesCount: number; currentDeadlineMs: number },
    onProgress?: (msg: string) => void
  ): void {
    const handleData = (isStderr: boolean, chunk: Buffer | string) => {
      state.lastActivityTimeMs = Date.now();
      const count = chunk.toString().split('\n').length;
      if (isStderr) state.stderrLinesCount += count;
      else state.stdoutLinesCount += count;

      if (state.currentDeadlineMs - Date.now() < 15_000) {
        state.currentDeadlineMs += this.extensionStepMs;
        if (onProgress) onProgress(`[Aegis Watchdog] Output streaming detected. Extended deadline by ${this.extensionStepMs / 1000}s`);
      }
    };

    child.stdout?.on('data', (d) => handleData(false, d));
    child.stderr?.on('data', (d) => handleData(true, d));
  }

  public async monitor(
    child: ChildProcess,
    timeoutSeconds: number,
    onProgress?: (msg: string) => void
  ): Promise<ProcessRunMetrics> {
    const startTimeMs = Date.now();
    const state = {
      currentDeadlineMs: startTimeMs + (timeoutSeconds * 1000),
      lastActivityTimeMs: Date.now(),
      stdoutLinesCount: 0,
      stderrLinesCount: 0
    };
    const flags = { timedOut: false, stagnated: false };

    return new Promise((resolve) => {
      this.setupDataListeners(child, state, onProgress);
      const interval = setInterval(() => {
        this.checkWatchdogTimer(child, state.lastActivityTimeMs, state.currentDeadlineMs, timeoutSeconds, interval, flags, onProgress);
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
          stdoutLinesCount: state.stdoutLinesCount,
          stderrLinesCount: state.stderrLinesCount
        });
      });
    });
  }
}
