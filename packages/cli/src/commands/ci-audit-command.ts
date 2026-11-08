/**
 * @file ci-audit-command.ts
 * Deterministic GitHub CI/CD pipeline verification runner & auditor.
 * Simulates all 10 gates from .github/workflows/ci.yml locally.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { execSync } from 'node:child_process';
import { cleanGitEnv, resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';

export interface CiStepDefinition {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly isCore: boolean;
}

export interface CiGateResult {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly error?: string;
  readonly skipped?: boolean;
}

export interface CiAuditSummary {
  readonly timestamp: string;
  readonly success: boolean;
  readonly totalCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly durationMs: number;
  readonly gates: readonly CiGateResult[];
}

export interface CiAuditOptions {
  fast?: boolean;
  json?: boolean;
  step?: string;
  failFast?: boolean;
}

export type StepExecutor = (
  command: string,
  cwd: string
) => { success: boolean; durationMs: number; error?: string };

export const CI_GATES: readonly CiStepDefinition[] = [
  { id: 'build', name: 'Monorepo TypeScript Build', command: 'npm run build', isCore: true },
  { id: 'typecheck', name: 'Monorepo Typecheck', command: 'npm run typecheck', isCore: true },
  { id: 'lint', name: 'Monorepo Lint', command: 'npm run lint', isCore: true },
  { id: 'deps:drift', name: 'Topological Dependency Radar', command: 'node packages/cli/dist/bin/aegis.js deps:drift', isCore: false },
  { id: 'cage:check', name: 'Demir Kafes Audit', command: 'node packages/cli/dist/bin/aegis.js cage:check', isCore: true },
  { id: 'verify', name: 'Iron Cage Verification', command: 'node packages/cli/dist/bin/aegis.js verify', isCore: false },
  { id: 'test', name: 'Monorepo Unit Test Suite', command: 'npm test', isCore: true },
  { id: 'inspect', name: 'Zero-Token UI Layout', command: 'node packages/cli/dist/bin/aegis.js inspect', isCore: false },
  { id: 'godot', name: 'Godot Bridge Pre-flight', command: 'node packages/cli/dist/bin/aegis.js godot status', isCore: false },
  { id: 'mutate', name: 'Mutation Testing Gate', command: 'node packages/cli/dist/bin/aegis.js mutate', isCore: false }
];

export function parseCiAuditOptions(args: string[]): CiAuditOptions {
  const options: CiAuditOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fast') {
      options.fast = true;
    } else if (arg === '--json' || arg === '-j') {
      options.json = true;
    } else if (arg.startsWith('--step=')) {
      options.step = arg.slice(7).trim();
    } else if (arg === '--step' && i + 1 < args.length) {
      options.step = args[++i].trim();
    } else if (arg === '--fail-fast' || arg === '--bail') {
      options.failFast = true;
    }
  }
  return options;
}

export function matchesStep(gate: CiStepDefinition, query: string): boolean {
  const q = query.toLowerCase();
  const id = gate.id.toLowerCase();
  return (
    id === q ||
    id.replace(':', '') === q.replace(':', '') ||
    gate.name.toLowerCase().includes(q) ||
    (id === 'godot' && (q === 'godot:status' || q === 'godot-status')) ||
    (id === 'deps:drift' && (q === 'deps' || q === 'drift')) ||
    (id === 'cage:check' && q === 'cage')
  );
}

export function filterCiGates(gates: readonly CiStepDefinition[], options: CiAuditOptions): CiStepDefinition[] {
  if (options.step) {
    const match = gates.find(g => matchesStep(g, options.step!));
    return match ? [match] : [];
  }
  if (options.fast) {
    return gates.filter(g => g.isCore);
  }
  return [...gates];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function defaultStepExecutor(command: string, cwd: string): { success: boolean; durationMs: number; error?: string } {
  const start = Date.now();
  try {
    const normCmd = command.startsWith('node ')
      ? `"${process.execPath}" ${command.slice(5)}`
      : command;
    execSync(normCmd, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90000,
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

function printFailureDetails(summary: CiAuditSummary): void {
  const failures = summary.gates.filter(g => !g.passed && !g.skipped);
  if (failures.length === 0) return;
  console.log('❌ Failed Gate Details:');
  for (const f of failures) {
    console.log(` • [${f.name}] (${f.command}):`);
    if (f.error) {
      const firstLine = f.error.split('\n')[0].slice(0, 100);
      console.log(`   ${firstLine}`);
    }
  }
  console.log('');
}

export function printCiAuditTable(summary: CiAuditSummary): void {
  const line = '─'.repeat(73);
  console.log(`\n${line}`);
  console.log(`${'#'.padEnd(4)}${'Gate Name'.padEnd(38)}${'Duration'.padEnd(14)}Status`);
  console.log(line);

  summary.gates.forEach((g, idx) => {
    const num = `${idx + 1}`.padEnd(4);
    const name = (g.name.length > 36 ? `${g.name.slice(0, 33)}...` : g.name).padEnd(38);
    const dur = (g.skipped ? '-' : formatDuration(g.durationMs)).padEnd(14);
    const status = g.skipped ? '⏭️ SKIPPED' : g.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${num}${name}${dur}${status}`);
  });

  console.log(line);
  const totalSec = (summary.durationMs / 1000).toFixed(1);
  if (summary.success) {
    console.log(`📊 CI Audit Result: ${summary.passedCount}/${summary.totalCount} gates passed (${totalSec}s) - CI READY ✅\n`);
  } else {
    console.log(`📊 CI Audit Result: ${summary.passedCount}/${summary.totalCount} passed, ${summary.failedCount} failed (${totalSec}s) - CI FAILED ❌\n`);
    printFailureDetails(summary);
  }
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.AEGIS_TEST === '1';
}

export async function handleCiAudit(args: string[] = [], customRunner?: CiAuditRunner): Promise<boolean> {
  const cleanArgs = args.filter(a => !['ci:audit', 'ci:check', 'ci:verify', 'ci:run', 'ci'].includes(a));
  const options = parseCiAuditOptions(cleanArgs);
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
