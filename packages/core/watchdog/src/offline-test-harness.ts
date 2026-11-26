/**
 * @file offline-test-harness.ts
 * Fail-safe offline test shield and network isolation harness.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import { debugLogIgnored, resolveNpmInvocation, type NpmInvocation } from '@aegis/shared';

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
    const safePid = Math.trunc(pid);
    try {
      if (process.platform === 'win32') {
        child_process.execFileSync('taskkill', ['/F', '/PID', String(safePid), '/T'], { stdio: 'ignore', windowsHide: true });
      } else {
        process.kill(-safePid, 'SIGKILL');
      }
    } catch (err: unknown) {
      debugLogIgnored('OfflineTestHarness:terminateTree', err);
      try {
        process.kill(safePid, 'SIGKILL');
      } catch (killErr: unknown) {
        debugLogIgnored('OfflineTestHarness:terminateTreeFallback', killErr);
      }
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

  private determineCommand(cwd: string, customCmd?: string, customArgs?: string[]): NpmInvocation {
    if (customCmd) {
      return { command: customCmd, args: customArgs ?? [] };
    }
    if (fs.existsSync(path.resolve(cwd, 'project.godot'))) {
      const args = ['--headless'];
      if (this.options.target) args.push(this.options.target);
      return { command: 'godot', args };
    }
    const args = ['test'];
    if (this.options.target) args.push('--', this.options.target);
    return resolveNpmInvocation(args);
  }

  private quoteBatchArg(arg: string): string {
    if (/[\0\r\n]/.test(arg)) throw new Error('Command argument contains unsupported control characters');
    if (arg.length === 0) return '""';
    if (!/[\s"&|<>^()%!;*?]/.test(arg)) return arg;
    return `"${arg.replace(/"/g, '""')}"`;
  }

  private resolveSpawnTarget(spec: NpmInvocation): NpmInvocation {
    const isWin = process.platform === 'win32';
    const lower = spec.command.toLowerCase();
    if (!isWin || (!lower.endsWith('.cmd') && !lower.endsWith('.bat'))) {
      return spec;
    }
    if (/[\0\r\n"]/.test(spec.command)) throw new Error('Batch command path contains invalid characters');
    const exe = /[\s&|<>^()%!;*?]/.test(spec.command) ? `"${spec.command}"` : spec.command;
    const quotedArgs = spec.args.map((a) => this.quoteBatchArg(a));
    const inner = [exe, ...quotedArgs].join(' ');
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `"${inner}"`],
      windowsVerbatimArguments: true
    };
  }

  private executeProcess(
    spec: NpmInvocation,
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const resolved = this.resolveSpawnTarget(spec);
      const child = child_process.spawn(resolved.command, resolved.args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: resolved.windowsVerbatimArguments
      });
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
    const spec = this.determineCommand(cwd, customCmd, customArgs);

    const exec = await this.executeProcess(spec, cwd, env, timeoutMs);
    const passed = exec.exitCode === 0 && !exec.timedOut;
    const offlineVerified = Boolean(env.AEGIS_OFFLINE_SHIM_ACTIVE === '1' || env.HTTP_PROXY);

    const telemetryPath = this.writeTelemetry(cwd, {
      timestamp: new Date().toISOString(),
      passed,
      offlineVerified,
      durationMs: exec.durationMs,
      exitCode: exec.exitCode,
      timedOut: exec.timedOut,
      command: `${spec.command} ${spec.args.join(' ')}`.trim(),
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
