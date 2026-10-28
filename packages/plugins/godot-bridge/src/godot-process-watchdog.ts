/**
 * @file godot-process-watchdog.ts
 * Process Lifecycle Monitor and Windows Tree-Kill Reaper for Headless Godot Substrates.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import * as child_process from 'node:child_process';

export interface WatchdogOptions {
  timeoutMs?: number;
  onTimeout?: (pid: number) => void;
  onCrash?: (code: number | null, signal: string | null, stderr: string) => void;
}

export interface SpawnAndMonitorResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export class GodotProcessWatchdog {
  private static wireProcessStreams(
    cp: child_process.ChildProcess,
    timer: NodeJS.Timeout,
    options: WatchdogOptions,
    resolve: (res: SpawnAndMonitorResult) => void
  ): void {
    let stdout = '';
    let stderr = '';

    cp.stdout?.on('data', (d) => { stdout += d.toString('utf8'); });
    cp.stderr?.on('data', (d) => { stderr += d.toString('utf8'); });

    cp.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 && options.onCrash) options.onCrash(code, signal, stderr);
      resolve({ exitCode: code, timedOut: false, stdout, stderr });
    });

    cp.on('error', (err) => {
      clearTimeout(timer);
      stderr += `\nSPAWN_ERROR: ${err.message}`;
      resolve({ exitCode: 1, timedOut: false, stdout, stderr });
    });
  }

  public static async executeWithWatchdog(
    binaryPath: string,
    args: string[],
    options: WatchdogOptions = {}
  ): Promise<SpawnAndMonitorResult> {
    const timeoutMs = options.timeoutMs ?? 15000;

    return new Promise((resolve) => {
      const cp = child_process.spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      const timer = setTimeout(() => {
        if (options.onTimeout && cp.pid) options.onTimeout(cp.pid);
        this.killProcessTree(cp.pid);
        resolve({ exitCode: 1, timedOut: true, stdout: '', stderr: 'Execution timed out' });
      }, timeoutMs);

      this.wireProcessStreams(cp, timer, options, resolve);
    });
  }

  public static killProcessTree(pid?: number): void {
    if (!pid) return;
    try {
      if (process.platform === 'win32') {
        child_process.execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(-pid, 'SIGKILL');
      }
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process might have already exited cleanly
      }
    }
  }
}
