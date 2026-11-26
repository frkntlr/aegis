import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as nodeModule from 'node:module';
import { spawnSync } from 'node:child_process';
import * as ts from 'typescript';
import { debugLogIgnored, formatErrorMessage, readJsonSafe, stripBom } from '@aegis/shared';
import { MutationGate, type Mutant } from './mutation-gate.js';
import { buildBaseTestArgs, collectTestFiles, findNearestFile, writeHookFiles } from './mutation-runner-helpers.js';

export interface RunFileMutationTestOptions {
  filePath: string;
  repoRoot?: string;
  maxMutants?: number;
  thresholdPercent?: number;
  testTimeoutMs?: number;
  changedLines?: ReadonlySet<number>;
}

export interface MutantSummary {
  id: string;
  line: number;
  desc: string;
}

export interface MutationRunReport {
  filePath: string;
  totalMutants: number;
  sampledMutants: number;
  killedMutants: number;
  survivedMutants: number;
  skippedCompileErrors: number;
  scorePercent: number;
  passedThreshold: boolean;
  baselinePassed: boolean;
  reason?: string;
  survivors: MutantSummary[];
}

interface TargetContext {
  displayPath: string;
  targetTs: string;
  pkgRoot: string;
  distJs: string;
  isEsm: boolean;
  baseArgs: string[];
}

interface CompiledMutant { mutant: Mutant; code: string; }

interface ExecuteMutantsOptions {
  ctx: TargetContext;
  sampled: CompiledMutant[];
  totalMutants: number;
  skippedCompileErrors: number;
  thresholdPercent: number;
  testTimeoutMs: number;
}

function failClosed(filePath: string, reason: string): MutationRunReport {
  return {
    filePath, totalMutants: 0, sampledMutants: 0, killedMutants: 0,
    survivedMutants: 0, skippedCompileErrors: 0, scorePercent: 0,
    passedThreshold: false, baselinePassed: false, reason, survivors: []
  };
}

function resolveTargetPaths(options: RunFileMutationTestOptions): { displayPath: string; targetTs: string; pkgRoot: string } | MutationRunReport {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : process.cwd();
  const targetTs = path.isAbsolute(options.filePath) ? path.resolve(options.filePath) : path.resolve(repoRoot, options.filePath);
  const relDisplay = path.relative(repoRoot, targetTs).replace(/\\/g, '/');
  const displayPath = relDisplay && !relDisplay.startsWith('..') ? relDisplay : options.filePath;
  if (!fs.existsSync(targetTs)) return failClosed(displayPath, `Source file not found: ${targetTs}`);
  const pkgRoot = findNearestFile(path.dirname(targetTs), 'package.json');
  if (!pkgRoot) return failClosed(displayPath, `Package root (package.json) not found for ${displayPath}`);
  return { displayPath, targetTs, pkgRoot };
}

function resolveModuleMode(targetTs: string, pkgRoot: string, displayPath: string): { isEsm: boolean } | MutationRunReport {
  let isEsm = targetTs.endsWith('.mts');
  try {
    if (readJsonSafe<{ type?: string }>(path.join(pkgRoot, 'package.json')).type === 'module') isEsm = true;
  } catch (err: unknown) {
    return failClosed(displayPath, `Failed to read package.json: ${formatErrorMessage(err)}`);
  }
  if (targetTs.endsWith('.cts')) isEsm = false;
  if (isEsm && typeof (nodeModule as { register?: unknown }).register !== 'function') {
    return failClosed(displayPath, 'ESM mutation hook requires Node >= 20.6 with node:module register()');
  }
  return { isEsm };
}

function resolveTargetContext(options: RunFileMutationTestOptions): TargetContext | MutationRunReport {
  const paths = resolveTargetPaths(options);
  if ('baselinePassed' in paths) return paths;
  const mode = resolveModuleMode(paths.targetTs, paths.pkgRoot, paths.displayPath);
  if ('baselinePassed' in mode) return mode;
  const relFromSrc = path.relative(path.join(paths.pkgRoot, 'src'), paths.targetTs);
  if (!relFromSrc || relFromSrc.startsWith('..') || path.isAbsolute(relFromSrc)) {
    return failClosed(paths.displayPath, `Target file must be inside package src/: ${paths.displayPath}`);
  }
  const distJs = path.join(paths.pkgRoot, 'dist', relFromSrc.replace(/\.(mts|cts|ts)$/, ext => (ext === '.mts' ? '.mjs' : ext === '.cts' ? '.cjs' : '.js')));
  if (!fs.existsSync(distJs)) return failClosed(paths.displayPath, `Compiled dist target not found: ${distJs}`);
  const stem = path.basename(paths.targetTs).replace(/\.(ts|mts|cts)$/, '');
  const testFiles = collectTestFiles(path.join(paths.pkgRoot, 'dist'), stem, distJs);
  if (testFiles.length === 0) return failClosed(paths.displayPath, `No compiled unit tests (*.test.js) found in ${path.join(paths.pkgRoot, 'dist')}`);
  return { displayPath: paths.displayPath, targetTs: paths.targetTs, pkgRoot: paths.pkgRoot, distJs, isEsm: mode.isEsm, baseArgs: buildBaseTestArgs(paths.pkgRoot, testFiles) };
}

function runNodeTest(pkgRoot: string, args: string[], timeoutMs: number, extraEnv?: Record<string, string>): boolean {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', AEGIS_TEST: '1', ...extraEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST_')) delete env[key];
  }
  const res = spawnSync(process.execPath, args, {
    cwd: pkgRoot, encoding: 'utf8', timeout: timeoutMs, stdio: 'pipe', env
  });
  return res.status === 0 && !res.error && res.signal === null;
}

function compileMutants(mutants: Mutant[], targetTs: string, isEsm: boolean): { compiled: CompiledMutant[]; skipped: number } {
  const compiled: CompiledMutant[] = [];
  let skipped = 0;
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: isEsm ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
    esModuleInterop: true, sourceMap: false, inlineSourceMap: false
  };
  for (const mutant of mutants) {
    const out = ts.transpileModule(mutant.mutatedCode, { fileName: targetTs, reportDiagnostics: true, compilerOptions });
    if ((out.diagnostics ?? []).some(d => d.category === ts.DiagnosticCategory.Error)) skipped++;
    else compiled.push({ mutant, code: out.outputText });
  }
  return { compiled, skipped };
}

function sampleMutants<T>(items: T[], maxCount: number): T[] {
  if (maxCount <= 0) return [];
  if (items.length <= maxCount) return items;
  return Array.from({ length: maxCount }, (_, i) => items[Math.floor((i * items.length) / maxCount)]);
}

function executeSampledMutants(opts: ExecuteMutantsOptions): MutationRunReport {
  const { ctx, sampled, totalMutants, skippedCompileErrors, thresholdPercent, testTimeoutMs } = opts;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mut-'));
  let killedMutants = 0;
  const survivors: MutantSummary[] = [];
  try {
    const { preloadCjs, hooksMjs, mutantFile } = writeHookFiles(tempDir);
    const canonicalDist = fs.realpathSync(ctx.distJs);
    const testArgs = ['--require', preloadCjs, ...ctx.baseArgs];
    for (const item of sampled) {
      fs.writeFileSync(mutantFile, item.code, 'utf8');
      const passed = runNodeTest(ctx.pkgRoot, testArgs, testTimeoutMs, {
        AEGIS_MUTANT_TARGET: canonicalDist, AEGIS_MUTANT_FILE: mutantFile,
        AEGIS_MUTANT_ESM: ctx.isEsm ? '1' : '0', AEGIS_MUTANT_HOOKS: hooksMjs
      });
      if (passed) survivors.push({ id: item.mutant.id, line: item.mutant.line, desc: item.mutant.id });
      else killedMutants++;
    }
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (err: unknown) { debugLogIgnored('mutation-runner:cleanup', err); }
  }
  const survivedMutants = sampled.length - killedMutants;
  const scorePercent = sampled.length > 0 ? Math.round((killedMutants / sampled.length) * 100) : 100;
  return {
    filePath: ctx.displayPath, totalMutants, sampledMutants: sampled.length,
    killedMutants, survivedMutants, skippedCompileErrors, scorePercent,
    passedThreshold: scorePercent >= thresholdPercent, baselinePassed: true, survivors
  };
}

export function runFileMutationTest(options: RunFileMutationTestOptions): MutationRunReport {
  const threshold = options.thresholdPercent ?? 70;
  const maxMutants = options.maxMutants ?? 15;
  const mutantTimeout = options.testTimeoutMs ?? 15000;
  const baselineTimeout = Math.max(45000, mutantTimeout);
  const resolved = resolveTargetContext(options);
  if ('baselinePassed' in resolved) return resolved;
  const sourceCode = stripBom(fs.readFileSync(resolved.targetTs, 'utf8'));
  const allMutants = new MutationGate({ minThresholdPercent: threshold }).generateMutants(sourceCode);
  const mutants = options.changedLines ? allMutants.filter(m => options.changedLines!.has(m.line)) : allMutants;
  if (options.changedLines && mutants.length === 0) {
    return {
      filePath: resolved.displayPath, totalMutants: 0, sampledMutants: 0,
      killedMutants: 0, survivedMutants: 0, skippedCompileErrors: 0,
      scorePercent: 100, passedThreshold: true, baselinePassed: true, survivors: []
    };
  }
  if (!runNodeTest(resolved.pkgRoot, resolved.baseArgs, baselineTimeout)) {
    return failClosed(resolved.displayPath, 'Baseline unit tests failed before mutation testing.');
  }
  const { compiled, skipped } = compileMutants(mutants, resolved.targetTs, resolved.isEsm);
  if (compiled.length === 0) {
    const allCompileFailed = mutants.length > 0;
    return {
      filePath: resolved.displayPath, totalMutants: mutants.length, sampledMutants: 0,
      killedMutants: 0, survivedMutants: 0, skippedCompileErrors: skipped,
      scorePercent: allCompileFailed ? 0 : 100, passedThreshold: !allCompileFailed,
      baselinePassed: true,
      reason: allCompileFailed ? 'All generated mutants failed TypeScript compilation.' : undefined,
      survivors: []
    };
  }
  return executeSampledMutants({
    ctx: resolved, sampled: sampleMutants(compiled, maxMutants),
    totalMutants: mutants.length, skippedCompileErrors: skipped, thresholdPercent: threshold, testTimeoutMs: mutantTimeout
  });
}
