/**
 * @file test-command.ts
 * Resilient, non-hanging test runner shield for Aegis and Antigravity Teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import { resolveSafeRepoRoot, cleanGitEnv } from '@aegis/shared';
import { DiagnosticTriageEnricher, type EnrichedDiagnostic } from '@aegis/iron-cage';
import { GodotTestRunner } from '@aegis/godot-bridge';
import { showBanner } from './banner.js';

export interface ResilientTestOptions {
  target?: string;
  timeoutMs?: number;
  bail?: boolean;
  json?: boolean;
  soft?: boolean;
  cwd?: string;
}

export interface ResilientTestResult {
  passed: boolean;
  timedOut: boolean;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  diagnostic?: EnrichedDiagnostic;
  message: string;
}

function killProcessTree(pid?: number): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      child_process.execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* ignore if already dead */ }
  }
}

function buildTestCommand(cwd: string, opts: ResilientTestOptions): { cmd: string; args: string[] } {
  const isGodot = fs.existsSync(path.resolve(cwd, 'project.godot'));
  if (isGodot) {
    return { cmd: 'godot', args: ['--headless'] };
  }
  const isWin = process.platform === 'win32';
  const npmCmd = isWin ? 'npm.cmd' : 'npm';
  const args = ['test'];
  if (opts.target) args.push('--', opts.target);
  if (opts.bail) args.push('--', '--bail');
  return { cmd: npmCmd, args };
}

function spawnProcessSafely(cmd: string, args: string[], cwd: string): child_process.ChildProcess {
  const env = { ...process.env, ...cleanGitEnv(), CI: 'true', AEGIS_TEST_SHIELD: '1', GIT_TERMINAL_PROMPT: '0' };
  if (process.platform === 'win32' && cmd.endsWith('.cmd')) {
    return child_process.spawn([cmd, ...args].join(' '), {
      cwd, stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true, shell: true
    });
  }
  return child_process.spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true });
}

function wireProcessEvents(
  proc: child_process.ChildProcess,
  timer: NodeJS.Timeout,
  start: number,
  resolve: (res: { stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number }) => void
): void {
  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (d) => { stdout += d.toString('utf8'); });
  proc.stderr?.on('data', (d) => { stderr += d.toString('utf8'); });

  proc.on('close', (code) => {
    clearTimeout(timer);
    resolve({ stdout, stderr, exitCode: code ?? 0, timedOut: false, durationMs: Date.now() - start });
  });
  proc.on('error', (err) => {
    clearTimeout(timer);
    resolve({ stdout, stderr: `${stderr}\nSPAWN_ERROR: ${err.message}`, exitCode: 1, timedOut: false, durationMs: Date.now() - start });
  });
}

function executeProcessWithWatchdog(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawnProcessSafely(cmd, args, cwd);
    const timer = setTimeout(() => {
      killProcessTree(proc.pid);
      resolve({ stdout: '', stderr: `Execution timed out after ${timeoutMs}ms`, exitCode: 124, timedOut: true, durationMs: Date.now() - start });
    }, timeoutMs);
    wireProcessEvents(proc, timer, start, resolve);
  });
}

function parseTestArgs(args: string[]): ResilientTestOptions {
  const opts: ResilientTestOptions = {};
  for (const a of args) {
    if (a === '--bail' || a === '-b') opts.bail = true;
    else if (a === '--json' || a === '-j') opts.json = true;
    else if (a === '--soft') opts.soft = true;
    else if (a.startsWith('--timeout=') || a.startsWith('-t=')) {
      opts.timeoutMs = parseInt(a.split('=')[1], 10);
    } else if (a && !a.startsWith('-')) {
      opts.target = a;
    }
  }
  return opts;
}

async function runGodotTest(root: string, target?: string): Promise<ResilientTestResult> {
  const start = Date.now();
  const gRes = await GodotTestRunner.runPlaytestScenario(root, target);
  return {
    passed: gRes.passed,
    timedOut: gRes.timedOut,
    durationMs: Date.now() - start,
    exitCode: gRes.exitCode ?? (gRes.passed ? 0 : 1),
    stdout: gRes.stdout,
    stderr: gRes.stderr,
    message: gRes.passed ? 'Godot playtest passed cleanly.' : 'Godot playtest failed.'
  };
}

export async function runResilientTest(options: ResilientTestOptions = {}): Promise<ResilientTestResult> {
  const root = options.cwd || resolveSafeRepoRoot();
  if (fs.existsSync(path.resolve(root, 'project.godot'))) {
    return runGodotTest(root, options.target);
  }
  const isMonorepo = fs.existsSync(path.resolve(root, 'turbo.json'));
  const timeoutMs = options.timeoutMs ?? (isMonorepo ? 90000 : 45000);
  const { cmd, args } = buildTestCommand(root, options);
  const raw = await executeProcessWithWatchdog(cmd, args, root, timeoutMs);

  const passed = raw.exitCode === 0 && !raw.timedOut;
  const diag = passed ? undefined : DiagnosticTriageEnricher.classify(`${raw.stderr}\n${raw.stdout}`.trim());
  const msg = passed ? `All tests passed in ${raw.durationMs}ms.`
    : (raw.timedOut ? `Tests TIMED OUT after ${timeoutMs}ms.` : `Tests failed with exit code ${raw.exitCode}.`);

  return {
    passed, timedOut: raw.timedOut, durationMs: raw.durationMs,
    exitCode: raw.exitCode, stdout: raw.stdout, stderr: raw.stderr,
    diagnostic: diag, message: msg
  };
}

function printTestReport(res: ResilientTestResult, opts: ResilientTestOptions): void {
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (res.passed) {
    console.log(`\n🎉 Tests PASSED in ${res.durationMs}ms! Zero errors detected.`);
    return;
  }

  console.error(`\n❌ Tests FAILED in ${res.durationMs}ms (exit code: ${res.exitCode})`);
  if (res.timedOut) {
    console.error(' 🛑 TIMEOUT: Test execution exceeded bounded watchdog limit. Process tree terminated safely.');
  }

  if (res.diagnostic) {
    console.error(`\n🔍 Socratic Diagnosis: [${res.diagnostic.category}] ${res.diagnostic.title}`);
    if (res.diagnostic.filePath) {
      const loc = res.diagnostic.line ? `:${res.diagnostic.line}` : '';
      console.error(` • Failure Location: ${res.diagnostic.filePath}${loc}`);
    }
    if (res.diagnostic.remediation) {
      console.error(` • 💡 Remediation: ${res.diagnostic.remediation}`);
    }
    if (res.diagnostic.filteredStack) {
      console.error('\n--- SANITIZED STACK TRACE ---');
      console.error(res.diagnostic.filteredStack);
    }
  } else if (res.stderr) {
    console.error(res.stderr.slice(0, 1000));
  }
}

export async function handleTestCommand(...rawArgs: string[]): Promise<boolean> {
  const opts = parseTestArgs(rawArgs);
  if (!opts.json) {
    showBanner();
    console.log('🛡️  Running Aegis Resilient Test Shield (Non-Hanging, Auto-Triage Watchdog)...');
  }

  const res = await runResilientTest(opts);
  printTestReport(res, opts);

  if (!res.passed && !opts.soft && process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
  return res.passed;
}
