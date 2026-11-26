/**
 * @file test-process-runner.ts
 * Process execution watchdog, command builder, and test report printer.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import {
  cleanGitEnv,
  debugLogIgnored,
  type NpmInvocation,
  resolveNpmInvocation
} from '@aegis/shared';
import type { EnrichedDiagnostic } from '@aegis/iron-cage';

export interface ResilientTestOptions {
  target?: string;
  timeoutMs?: number;
  bail?: boolean;
  json?: boolean;
  soft?: boolean;
  cwd?: string;
  offline?: boolean;
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
  offlineVerified?: boolean;
  telemetryPath?: string;
}

function killProcessTree(pid?: number): void {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return;
  const safePid = Math.trunc(pid);
  try {
    if (process.platform === 'win32') {
      child_process.execFileSync('taskkill', ['/F', '/PID', String(safePid), '/T'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      process.kill(-safePid, 'SIGKILL');
    }
  } catch (err: unknown) {
    debugLogIgnored('TestCommand:killProcessTree', err);
    try {
      process.kill(safePid, 'SIGKILL');
    } catch (killErr: unknown) {
      debugLogIgnored('TestCommand:killFallback', killErr);
    }
  }
}

export function buildTestCommand(cwd: string, opts: ResilientTestOptions): NpmInvocation {
  const isGodot = fs.existsSync(path.resolve(cwd, 'project.godot'));
  if (isGodot) {
    return { command: 'godot', args: ['--headless'] };
  }
  const args = ['test'];
  if (opts.target) args.push('--', opts.target);
  if (opts.bail) args.push('--', '--bail');
  return resolveNpmInvocation(args);
}

function spawnProcessSafely(spec: NpmInvocation, cwd: string): child_process.ChildProcess {
  const env = { ...process.env, ...cleanGitEnv(), CI: 'true', AEGIS_TEST_SHIELD: '1', GIT_TERMINAL_PROMPT: '0' };
  return child_process.spawn(spec.command, spec.args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    windowsHide: true,
    shell: false,
    windowsVerbatimArguments: spec.windowsVerbatimArguments
  });
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

export function executeProcessWithWatchdog(
  spec: NpmInvocation,
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawnProcessSafely(spec, cwd);
    const timer = setTimeout(() => {
      killProcessTree(proc.pid);
      resolve({ stdout: '', stderr: `Execution timed out after ${timeoutMs}ms`, exitCode: 124, timedOut: true, durationMs: Date.now() - start });
    }, timeoutMs);
    wireProcessEvents(proc, timer, start, resolve);
  });
}

function printDiagnostic(diag: EnrichedDiagnostic): void {
  console.error(`\n🔍 Socratic Diagnosis: [${diag.category}] ${diag.title}`);
  if (diag.filePath) {
    const loc = diag.line ? `:${diag.line}` : '';
    console.error(` • Failure Location: ${diag.filePath}${loc}`);
  }
  if (diag.remediation) {
    console.error(` • 💡 Remediation: ${diag.remediation}`);
  }
  if (diag.filteredStack) {
    console.error('\n--- SANITIZED STACK TRACE ---');
    console.error(diag.filteredStack);
  }
}

export function printTestReport(res: ResilientTestResult, opts: ResilientTestOptions): void {
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (opts.offline || res.offlineVerified) {
    console.log('🛡️ Offline Shield Active: Host internet preserved, target process network-isolated');
    if (res.telemetryPath) console.log(` 📦 Offline Telemetry: ${res.telemetryPath}`);
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
    printDiagnostic(res.diagnostic);
  } else if (res.stderr) {
    console.error(res.stderr.slice(0, 1000));
  }
}
