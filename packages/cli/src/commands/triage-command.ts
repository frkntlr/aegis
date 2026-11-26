import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EvidenceBasedTriageGate,
  IronCageValidator,
  TriageCacheRadar,
  EvidenceIngestor,
  BlastRadiusStratifier,
  fnv1a,
  type StratifiedFinding
} from '@aegis/iron-cage';
import { RelationalGraph } from '@aegis/ast-skeleton';
import { LoopBreaker } from '@aegis/watchdog';
import { debugLogIgnored, resolveSafeCacheDir, type CageViolation } from '@aegis/shared';
import { handleDebugCommand } from './debug-command.js';
import { showBanner } from './banner.js';
import { collectSourceFiles } from './dev-helpers.js';

export interface TriageCommandOptions {
  targetDir?: string;
  withTests?: boolean | string;
  withGodot?: boolean | string;
  noCache?: boolean;
  autoDispatch?: boolean;
  jsonOutput?: boolean;
}

const SIMPLE_TRIAGE_FLAGS: Record<string, (opts: TriageCommandOptions) => void> = {
  '--no-cache': o => { o.noCache = true; },
  '--auto-dispatch': o => { o.autoDispatch = true; },
  '--debug': o => { o.autoDispatch = true; },
  '--json': o => { o.jsonOutput = true; }
};

function readOptionalFlagValue(args: string[], index: number, prefix: string): { value: string | true; step: number } {
  const arg = args[index];
  if (arg.startsWith(`${prefix}=`)) {
    return { value: arg.slice(prefix.length + 1), step: 0 };
  }
  const next = args[index + 1];
  if (next && !next.startsWith('--')) {
    return { value: next, step: 1 };
  }
  return { value: true, step: 0 };
}

function applyTriageArg(args: string[], index: number, options: TriageCommandOptions): number {
  const arg = args[index];
  const simple = SIMPLE_TRIAGE_FLAGS[arg];
  if (simple) {
    simple(options);
    return 0;
  }
  if (arg === '--with-tests' || arg.startsWith('--with-tests=')) {
    const parsed = readOptionalFlagValue(args, index, '--with-tests');
    options.withTests = parsed.value;
    return parsed.step;
  }
  if (arg === '--with-godot' || arg.startsWith('--with-godot=')) {
    const parsed = readOptionalFlagValue(args, index, '--with-godot');
    options.withGodot = parsed.value;
    return parsed.step;
  }
  if (!arg.startsWith('--') && !options.targetDir) options.targetDir = arg;
  return 0;
}

export function parseTriageArgs(rawArgs?: string | string[]): TriageCommandOptions {
  const args = Array.isArray(rawArgs) ? rawArgs : (rawArgs ? [rawArgs] : []);
  const options: TriageCommandOptions = {};
  for (let i = 0; i < args.length; i++) {
    i += applyTriageArg(args, i, options);
  }
  return options;
}

function resolveRelationalGraph(): RelationalGraph | undefined {
  const graphCachePath = resolveSafeCacheDir('graph.json');
  if (fs.existsSync(graphCachePath)) {
    try {
      const graph = new RelationalGraph();
      if (graph.loadCache(graphCachePath)) return graph;
    } catch (err: unknown) {
      debugLogIgnored('triage-command:graphCache', err);
    }
  }
  return undefined;
}

interface ScanResult {
  violations: CageViolation[];
  cacheHits: number;
}

function scanFiles(files: string[], noCache = false): ScanResult {
  const validator = new IronCageValidator();
  const radar = noCache ? null : new TriageCacheRadar();
  const violations: CageViolation[] = [];
  let cacheHits = 0;

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    try {
      const stat = fs.statSync(file);
      if (radar) {
        const check = radar.checkFileStat(rel, stat.mtimeMs, stat.size);
        if (check.hit && check.cachedViolations) {
          violations.push(...check.cachedViolations);
          cacheHits++;
          continue;
        }
      }
      const content = fs.readFileSync(file, 'utf8');
      const res = validator.validateFileContent(rel, content);
      violations.push(...res.violations);
      if (radar) {
        radar.recordFile({
          filePath: rel,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          content,
          violations: res.violations
        });
      }
    } catch (err: unknown) {
      debugLogIgnored('triage-command:scanFile', err);
    }
  }

  if (radar) radar.flush();
  return { violations, cacheHits };
}

export function handleTriage(rawArgs?: string | string[]): Promise<void> | void {
  const opts = parseTriageArgs(rawArgs);
  showBanner();
  const pkgDir = path.resolve(process.cwd(), 'packages');
  const base = opts.targetDir ? path.resolve(process.cwd(), opts.targetDir) : (fs.existsSync(pkgDir) ? pkgDir : process.cwd());
  console.log(`🛡️  Running Evidence-Based Bug Triage on: ${path.relative(process.cwd(), base) || '.'}...`);

  const files = collectSourceFiles(base);
  const { violations, cacheHits } = scanFiles(files, opts.noCache);

  const evidence = EvidenceIngestor.ingest({
    testsPath: typeof opts.withTests === 'string' ? opts.withTests : (opts.withTests ? '' : undefined),
    godotLogPath: typeof opts.withGodot === 'string' ? opts.withGodot : (opts.withGodot ? '' : undefined)
  });

  const gate = new EvidenceBasedTriageGate();
  const report = gate.evaluate({
    targetFiles: files.map(f => path.relative(process.cwd(), f)),
    violations,
    testFailures: evidence.testFailures,
    engineErrors: evidence.engineErrors,
    failingTestsCount: evidence.failingTestsCount
  });

  const graph = resolveRelationalGraph();
  const stratified = BlastRadiusStratifier.stratifyAll(report.findings, { graph });

  printTriageReport(report, files.length, cacheHits, stratified);

  if (opts.autoDispatch && !report.clean) {
    return handleAutoDispatch(stratified);
  }

  if (!report.clean && process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

async function handleAutoDispatch(stratified: StratifiedFinding[]): Promise<void> {
  const topCritical = stratified.find(f => f.tier === 'TIER_1_CRITICAL_BLAST' || f.category === 'CRITICAL_DEFECT');
  if (!topCritical) {
    console.log('ℹ️  No Tier 1 blocking defect available for auto-dispatch.');
    return;
  }

  const keyStr = `${topCritical.filePath}:${topCritical.line || 0}`;
  const numKey = Math.abs(parseInt(fnv1a(keyStr), 16)) % 1000000 || 1;
  const breaker = new LoopBreaker();
  const evalRes = breaker.recordFailure(numKey, topCritical.title);

  if (evalRes.blocked) {
    console.log(`⚠️  DISPATCH_BLOCKED_CIRCUIT_BREAKER: Defect on ${topCritical.filePath} reached threshold (${evalRes.attempts}). Auto-dispatch halted.`);
    return;
  }

  console.log(`🚀 Auto-dispatching Tier 1 defect [${topCritical.filePath}] to Socratic DialogueEngine...`);
  const evidenceText = `${topCritical.title}\n${topCritical.evidence}${topCritical.filteredStack ? '\n' + topCritical.filteredStack : ''}`;
  await handleDebugCommand(evidenceText, { targetWorktree: 'solver', silent: false });
}

function printTriageReport(
  report: ReturnType<EvidenceBasedTriageGate['evaluate']>,
  filesCount: number,
  cacheHits: number,
  stratified: StratifiedFinding[]
): void {
  console.log(` • Files Scanned:       ${filesCount} (${cacheHits} cached, 0ms)`);
  console.log(` • 🔴 Critical Defects: ${report.criticalCount} (Test/Log/Crash proven bugs)`);
  console.log(` • 🟡 Tech Debt:         ${report.debtCount} (Demir Kafes >40 line / complexity refactors)`);
  console.log(` • ⚪ Code Smells:       ${report.smellCount}`);
  console.log('──────────────────────────────────────────────────');

  if (report.clean) {
    console.log('✅ Triage Verdict: CLEAN (Zero blocking bugs). No false alarms triggered!');
    if (report.debtCount > 0) {
      console.log(`ℹ️  Note: ${report.debtCount} Demir Kafes style items segregated to Refactor pool.`);
    }
  } else {
    console.log(`❌ Triage Verdict: ${report.criticalCount} Critical Defect(s) need immediate fix:`);
    for (const f of stratified.filter(item => item.category === 'CRITICAL_DEFECT')) {
      const blast = f.blastRadius > 0 ? ` (Blast Radius: ${f.blastRadius})` : '';
      console.log(`   - [${f.tier}] [${f.filePath}] ${f.title}: ${f.evidence}${blast}`);
    }
  }
}
