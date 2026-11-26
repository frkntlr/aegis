/**
 * @file test-command.ts
 * Resilient, non-hanging test runner shield for Aegis and Antigravity Teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { DiagnosticTriageEnricher } from '@aegis/iron-cage';
import { GodotTestRunner } from '@aegis/godot-bridge';
import { OfflineTestHarness } from '@aegis/watchdog';
import { showBanner } from './banner.js';
import {
  buildTestCommand,
  executeProcessWithWatchdog,
  printTestReport,
  type ResilientTestOptions,
  type ResilientTestResult
} from './test-process-runner.js';

export {
  buildTestCommand,
  type ResilientTestOptions,
  type ResilientTestResult
} from './test-process-runner.js';

function parseTestArgs(args: string[]): ResilientTestOptions {
  const opts: ResilientTestOptions = {};
  for (const a of args) {
    if (a === '--bail' || a === '-b') opts.bail = true;
    else if (a === '--json' || a === '-j') opts.json = true;
    else if (a === '--soft') opts.soft = true;
    else if (a === '--offline' || a === 'test:offline' || a === 'offline' || a === ':offline') {
      opts.offline = true;
    } else if (a.startsWith('--timeout=') || a.startsWith('-t=')) {
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

async function runOfflineTest(root: string, options: ResilientTestOptions): Promise<ResilientTestResult> {
  const isMonorepo = fs.existsSync(path.resolve(root, 'turbo.json'));
  const timeoutMs = options.timeoutMs ?? (isMonorepo ? 90000 : 45000);
  const harness = new OfflineTestHarness({
    target: options.target,
    timeoutMs,
    cwd: root
  });
  const raw = await harness.run();
  const passed = raw.passed && raw.exitCode === 0;
  const timedOut = raw.exitCode === 124;
  const diag = passed ? undefined : DiagnosticTriageEnricher.classify(`${raw.stderr}\n${raw.stdout}`.trim());
  const msg = passed ? `All offline tests passed cleanly in ${raw.durationMs}ms.`
    : (timedOut ? `Offline tests TIMED OUT after ${timeoutMs}ms.` : `Offline tests failed with exit code ${raw.exitCode}.`);

  return {
    passed, timedOut, durationMs: raw.durationMs,
    exitCode: raw.exitCode, stdout: raw.stdout, stderr: raw.stderr,
    diagnostic: diag, message: msg,
    offlineVerified: raw.offlineVerified, telemetryPath: raw.telemetryPath
  };
}

export async function runResilientTest(options: ResilientTestOptions = {}): Promise<ResilientTestResult> {
  const root = options.cwd || resolveSafeRepoRoot();
  if (options.offline) {
    return runOfflineTest(root, options);
  }
  if (fs.existsSync(path.resolve(root, 'project.godot'))) {
    return runGodotTest(root, options.target);
  }
  const isMonorepo = fs.existsSync(path.resolve(root, 'turbo.json'));
  const timeoutMs = options.timeoutMs ?? (isMonorepo ? 90000 : 45000);
  const spec = buildTestCommand(root, options);
  const raw = await executeProcessWithWatchdog(spec, root, timeoutMs);

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

export async function handleTestCommand(...rawArgs: string[]): Promise<boolean> {
  const opts = parseTestArgs(rawArgs);
  if (!opts.json) {
    showBanner();
    if (opts.offline) {
      console.log('🛡️ Offline Shield Active: Host internet preserved, target process network-isolated');
    }
    console.log('🛡️  Running Aegis Resilient Test Shield (Non-Hanging, Auto-Triage Watchdog)...');
  }

  const res = await runResilientTest(opts);
  printTestReport(res, opts);

  if (!res.passed && !opts.soft && process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
  return res.passed;
}
