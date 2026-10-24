import { spawn, type ChildProcess } from 'node:child_process';
import type { ProcessRunMetrics } from '@aegis/shared';

export interface HeartbeatOptions {
  stagnationThresholdMs?: number;
  extensionStepMs?: number;
}

interface MonitorState {
  currentDeadlineMs: number;
  lastActivityTimeMs: number;
  stdoutLinesCount: number;
  stderrLinesCount: number;
}

export class HeartbeatMonitor {
  private stagnationThresholdMs: number;
  private extensionStepMs: number;

  constructor(options: HeartbeatOptions = {}) {
    this.stagnationThresholdMs = options.stagnationThresholdMs ?? 60_000;
    this.extensionStepMs = options.extensionStepMs ?? 30_000;
  }

  private terminateProcess(child: ChildProcess, signal: NodeJS.Signals): void {
    if (process.platform === 'win32' && child.pid) {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // Ignore taskkill errors if already terminated
      }
    }
    try {
      child.kill(signal);
    } catch {
      // Ignore if process already closed
    }
  }

  private checkWatchdogTimer(
    child: ChildProcess,
    state: MonitorState,
    timeoutSeconds: number,
    interval: NodeJS.Timeout,
    flags: { stagnated: boolean; timedOut: boolean },
    onProgress?: (msg: string) => void
  ): void {
    const now = Date.now();
    const timeSinceActivity = now - state.lastActivityTimeMs;

    if (timeSinceActivity > this.stagnationThresholdMs && child.exitCode === null) {
      flags.stagnated = true;
      clearInterval(interval);
      if (onProgress) onProgress(`[Aegis Watchdog] Stagnation detected (${timeSinceActivity / 1000}s silence). Terminating.`);
      this.terminateProcess(child, 'SIGTERM');
    }

    if (now > state.currentDeadlineMs && child.exitCode === null) {
      flags.timedOut = true;
      clearInterval(interval);
      if (onProgress) onProgress(`[Aegis Watchdog] Dynamic timeout limit reached (${timeoutSeconds}s). Hard killing process.`);
      this.terminateProcess(child, 'SIGKILL');
    }
  }

  private setupDataListeners(
    child: ChildProcess,
    state: MonitorState,
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
    const state: MonitorState = {
      currentDeadlineMs: startTimeMs + (timeoutSeconds * 1000),
      lastActivityTimeMs: Date.now(),
      stdoutLinesCount: 0,
      stderrLinesCount: 0
    };
    const flags = { timedOut: false, stagnated: false };

    return new Promise((resolve) => {
      this.setupDataListeners(child, state, onProgress);
      const interval = setInterval(() => {
        this.checkWatchdogTimer(child, state, timeoutSeconds, interval, flags, onProgress);
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
