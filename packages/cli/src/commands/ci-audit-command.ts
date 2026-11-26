/**
 * @file ci-audit-command.ts
 * Deterministic GitHub CI/CD pipeline verification runner & auditor.
 * Simulates all 11 gates from .github/workflows/ci.yml locally.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { execSync } from 'node:child_process';
import { cleanGitEnv, resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';
import {
  CI_GATES,
  filterCiGates,
  parseCiAuditOptions,
  printCiAuditTable,
  type CiAuditOptions,
  type CiAuditSummary,
  type CiGateResult,
  type CiStepDefinition,
  type StepExecutor
} from './ci-audit-gates.js';

export {
  CI_GATES,
  parseCiAuditOptions,
  matchesStep,
  filterCiGates,
  formatDuration,
  printCiAuditTable,
  type CiStepDefinition,
  type CiGateResult,
  type CiAuditSummary,
  type CiAuditOptions,
  type StepExecutor
} from './ci-audit-gates.js';

export function defaultStepExecutor(command: string, cwd: string): { success: boolean; durationMs: number; error?: string } {
  const start = Date.now();
  try {
    const normCmd = command.replace(/(^|&&\s*)node\s+/g, `$1"${process.execPath}" `);
    execSync(normCmd, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...cleanGitEnv(), CI: 'true', GIT_TERMINAL_PROMPT: '0' },
      encoding: 'utf8'
    });
    return { success: true, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, durationMs: Date.now() - start, error: msg };
  }
}

function executeSingleGate(
  gate: CiStepDefinition,
  repoRoot: string,
  executor: StepExecutor,
  skip: boolean
): CiGateResult {
  if (skip) {
    return { id: gate.id, name: gate.name, command: gate.command, passed: false, durationMs: 0, skipped: true };
  }
  const res = executor(gate.command, repoRoot);
  return {
    id: gate.id,
    name: gate.name,
    command: gate.command,
    passed: res.success,
    durationMs: res.durationMs,
    error: res.error
  };
}

function buildSummary(results: CiGateResult[], startAll: number): CiAuditSummary {
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed && !r.skipped).length;
  const skippedCount = results.filter(r => r.skipped).length;
  return {
    timestamp: new Date().toISOString(),
    success: failedCount === 0 && results.length > 0,
    totalCount: results.length,
    passedCount,
    failedCount,
    skippedCount,
    durationMs: Date.now() - startAll,
    gates: results
  };
}

export class CiAuditRunner {
  private repoRoot: string;
  private executor: StepExecutor;

  constructor(repoRoot?: string, executor: StepExecutor = defaultStepExecutor) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.executor = executor;
  }

  public runGates(gates: readonly CiStepDefinition[], failFast = false): CiAuditSummary {
    const startAll = Date.now();
    const results: CiGateResult[] = [];
    let hadFailure = false;

    for (const gate of gates) {
      const skip = hadFailure && failFast;
      const res = executeSingleGate(gate, this.repoRoot, this.executor, skip);
      if (!res.passed && !res.skipped) hadFailure = true;
      results.push(res);
    }

    return buildSummary(results, startAll);
  }
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.AEGIS_TEST === '1';
}

export async function handleCiAudit(args: string[] = [], customRunner?: CiAuditRunner): Promise<boolean> {
  const cleanArgs = args.filter(a => !['ci:audit', 'ci:check', 'ci:verify', 'ci:run', 'ci'].includes(a));
  const options: CiAuditOptions = parseCiAuditOptions(cleanArgs);
  if (!options.json) {
    showBanner();
    console.log('🚀 Aegis CI / CD Pipeline Auditor & Verification Runner');
  }

  const selectedGates = filterCiGates(CI_GATES, options);
  if (selectedGates.length === 0) {
    if (options.json) console.log(JSON.stringify({ error: `No CI gate matched: "${options.step}"` }, null, 2));
    else console.error(`❌ No CI gate matched step: "${options.step}"`);
    if (!isTestEnv()) process.exit(1);
    return false;
  }

  const runner = customRunner || new CiAuditRunner();
  const summary = runner.runGates(selectedGates, options.failFast);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printCiAuditTable(summary);
  }

  if (!summary.success && !isTestEnv()) {
    process.exit(1);
  }
  return summary.success;
}
