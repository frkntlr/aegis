import { spawn, type ChildProcess } from 'node:child_process';
import type { ProcessRunMetrics } from '@aegis/shared';

export type ProcessTerminatorHook = (child: ChildProcess, signal: NodeJS.Signals) => void;

export interface HeartbeatOptions {
  stagnationThresholdMs?: number;
  extensionStepMs?: number;
  checkIntervalMs?: number;
  terminator?: ProcessTerminatorHook;
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
  private checkIntervalMs?: number;
  private customTerminator?: ProcessTerminatorHook;

  constructor(options: HeartbeatOptions = {}) {
    this.stagnationThresholdMs = options.stagnationThresholdMs ?? 60_000;
    this.extensionStepMs = options.extensionStepMs ?? 30_000;
    this.checkIntervalMs = options.checkIntervalMs;
    this.customTerminator = options.terminator;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private terminateProcess(child: ChildProcess, signal: NodeJS.Signals): void {
    if (this.customTerminator) {
      try {
        this.customTerminator(child, signal);
      } catch {
        // Ignore custom terminator errors
      }
      return;
    }

    if (process.platform === 'win32' && child.pid) {
      if (this.isProcessAlive(child.pid)) {
        try {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true
          });
          killer.unref();
        } catch {
          // Ignore taskkill errors if already terminated
        }
      }
    } else if (child.pid && process.platform !== 'win32') {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // Fallback to regular kill if not a process group leader
      }
    }

    try {
      child.kill(signal);
    } catch {
      // Ignore if process already closed
    }
  }

  private resolveIntervalMs(timeoutSeconds: number): number {
    if (this.checkIntervalMs && this.checkIntervalMs > 0) {
      return this.checkIntervalMs;
    }
    const timeoutMs = timeoutSeconds * 1000;
    const minThreshold = Math.min(this.stagnationThresholdMs, timeoutMs);
    if (minThreshold < 1000) {
      return Math.max(10, Math.floor(minThreshold / 2));
    }
    return 1000;
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
    const intervalMs = this.resolveIntervalMs(timeoutSeconds);

    return new Promise((resolve) => {
      this.setupDataListeners(child, state, onProgress);
      const interval = setInterval(() => {
        this.checkWatchdogTimer(child, state, timeoutSeconds, interval, flags, onProgress);
      }, intervalMs);

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
