/**
 * @file ci-audit-gates.ts
 * CI gate definitions, option parsing, filtering, and reporting for ci:audit.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

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
  { id: 'arch:health', name: 'Architecture Health Gate', command: 'node packages/cli/dist/bin/aegis.js arch:health --strict --max-cycles=0 --min-score=95', isCore: true },
  { id: 'verify', name: 'Iron Cage Verification', command: 'node packages/cli/dist/bin/aegis.js verify', isCore: false },
  { id: 'test', name: 'Monorepo Unit Test Suite', command: 'npm test', isCore: true },
  { id: 'inspect', name: 'Zero-Token UI Layout', command: 'node packages/cli/dist/bin/aegis.js inspect packages/plugins/godot-bridge/fixtures/inspect-sample', isCore: false },
  { id: 'godot', name: 'Godot Bridge Pre-flight', command: 'node packages/cli/dist/bin/aegis.js godot status && node packages/cli/dist/bin/aegis.js godot inspect packages/plugins/godot-bridge/fixtures/inspect-sample', isCore: false },
  { id: 'mutate', name: 'Mutation Testing Gate', command: 'node packages/cli/dist/bin/aegis.js mutate packages/core/watchdog/src/pre-execution-estimator.ts packages/core/iron-cage/src/line-budget-radar.ts packages/shared/src/json-safe.ts', isCore: false }
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
    (id === 'cage:check' && q === 'cage') ||
    (id === 'arch:health' && (q === 'arch' || q === 'archhealth'))
  );
}

export function filterCiGates(gates: readonly CiStepDefinition[], options: CiAuditOptions): CiStepDefinition[] {
  const stepQuery = options.step;
  if (stepQuery) {
    const match = gates.find(g => matchesStep(g, stepQuery));
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
