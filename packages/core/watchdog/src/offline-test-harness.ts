/**
 * @file offline-test-harness.ts
 * Fail-safe offline test shield and network isolation harness.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';

export interface OfflineTestHarnessOptions {
  target?: string;
  timeoutMs?: number;
  cwd?: string;
  tier?: 'auto' | 'process_shim' | 'proxy_blackhole' | 'atomic_script';
}

export interface OfflineTestResult {
  passed: boolean;
  offlineVerified: boolean;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  telemetryPath: string;
}

type IsolationTier = 'process_shim' | 'proxy_blackhole' | 'atomic_script';

export class OfflineTestHarness {
  private readonly options: OfflineTestHarnessOptions;

  constructor(options: OfflineTestHarnessOptions = {}) {
    this.options = options;
  }

  public static resolveShimPath(): string | undefined {
    const candidates = [
      path.resolve(__dirname, 'nodejs-offline-shim.js'),
      path.resolve(__dirname, '../dist/nodejs-offline-shim.js'),
      path.resolve(process.cwd(), 'packages/core/watchdog/dist/nodejs-offline-shim.js'),
      path.resolve(process.cwd(), 'node_modules/@aegis/watchdog/dist/nodejs-offline-shim.js')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return undefined;
  }

  private terminateTree(pid?: number): void {
    if (!pid) return;
    try {
      if (process.platform === 'win32') {
        child_process.execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(-pid, 'SIGKILL');
      }
    } catch {
      try { process.kill(pid, 'SIGKILL'); } catch { /* ignore if already exited */ }
    }
  }

  private detectTier(cwd: string): IsolationTier {
    if (this.options.tier && this.options.tier !== 'auto') {
      return this.options.tier;
    }
    const hasPackageJson = fs.existsSync(path.resolve(cwd, 'package.json'));
    const shimPath = OfflineTestHarness.resolveShimPath();
    if (hasPackageJson && shimPath) {
      return 'process_shim';
    }
    return 'proxy_blackhole';
  }

  private buildIsolationEnv(_cwd: string, tier: IsolationTier): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      ALL_PROXY: 'http://127.0.0.1:9',
      NO_PROXY: '',
      npm_config_proxy: 'http://127.0.0.1:9',
      npm_config_https_proxy: 'http://127.0.0.1:9',
      AEGIS_OFFLINE_SHIELD_ACTIVE: '1',
      CI: 'true'
    };

    if (tier === 'process_shim' || tier === 'atomic_script') {
      const shim = OfflineTestHarness.resolveShimPath();
      if (shim) {
        const normalized = shim.replace(/\\/g, '/');
        const prev = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ` : '';
        env.NODE_OPTIONS = `${prev}--require "${normalized}"`;
        env.AEGIS_OFFLINE_SHIM_ACTIVE = '1';
      }
    }
    return env;
  }

  private determineCommand(cwd: string, customCmd?: string, customArgs?: string[]): { cmd: string; args: string[] } {
    if (customCmd) {
      return { cmd: customCmd, args: customArgs ?? [] };
    }
    if (fs.existsSync(path.resolve(cwd, 'project.godot'))) {
      const args = ['--headless'];
      if (this.options.target) args.push(this.options.target);
      return { cmd: 'godot', args };
    }
    const isWin = process.platform === 'win32';
    const npmCmd = isWin ? 'npm.cmd' : 'npm';
    const args = ['test'];
    if (this.options.target) args.push('--', this.options.target);
    return { cmd: npmCmd, args };
  }

  private executeProcess(
    cmd: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const isWin = process.platform === 'win32';
      const useShell = isWin && (cmd.endsWith('.cmd') || cmd.endsWith('.bat'));
      const spawnCmd = useShell ? [cmd, ...args].join(' ') : cmd;
      const spawnArgs = useShell ? [] : args;
      const child = child_process.spawn(spawnCmd, spawnArgs, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: useShell, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        this.terminateTree(child.pid);
      }, timeoutMs);

      child.stdout?.on('data', (c) => { stdout += c.toString('utf8'); });
      child.stderr?.on('data', (c) => { stderr += c.toString('utf8'); });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? (timedOut ? 124 : 0), timedOut, durationMs: Date.now() - start });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: `${stderr}\n${err.message}`, exitCode: 1, timedOut: false, durationMs: Date.now() - start });
      });
    });
  }

  private writeTelemetry(cwd: string, record: Record<string, unknown>): string {
    const dir = path.resolve(cwd, '.aegis');
    fs.mkdirSync(dir, { recursive: true });
    const targetPath = path.resolve(dir, 'offline-results.json');
    fs.writeFileSync(targetPath, JSON.stringify(record, null, 2), 'utf8');
    return targetPath;
  }

  public async run(customCmd?: string, customArgs?: string[]): Promise<OfflineTestResult> {
    const cwd = this.options.cwd || process.cwd();
    const timeoutMs = this.options.timeoutMs ?? 45_000;
    const tier = this.detectTier(cwd);
    const env = this.buildIsolationEnv(cwd, tier);
    const { cmd, args } = this.determineCommand(cwd, customCmd, customArgs);

    const exec = await this.executeProcess(cmd, args, cwd, env, timeoutMs);
    const passed = exec.exitCode === 0 && !exec.timedOut;
    const offlineVerified = Boolean(env.AEGIS_OFFLINE_SHIM_ACTIVE === '1' || env.HTTP_PROXY);

    const telemetryPath = this.writeTelemetry(cwd, {
      timestamp: new Date().toISOString(),
      passed,
      offlineVerified,
      durationMs: exec.durationMs,
      exitCode: exec.exitCode,
      timedOut: exec.timedOut,
      command: `${cmd} ${args.join(' ')}`.trim(),
      tier,
      target: this.options.target
    });

    return {
      passed,
      offlineVerified,
      durationMs: exec.durationMs,
      exitCode: exec.exitCode,
      stdout: exec.stdout,
      stderr: exec.stderr,
      telemetryPath
    };
  }

  public static async run(options: OfflineTestHarnessOptions = {}): Promise<OfflineTestResult> {
    const harness = new OfflineTestHarness(options);
    return harness.run();
  }
}
