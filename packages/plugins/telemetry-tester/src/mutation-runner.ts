import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as nodeModule from 'node:module';
import { spawnSync } from 'node:child_process';
import * as ts from 'typescript';
import { debugLogIgnored, formatErrorMessage, readJsonSafe, stripBom } from '@aegis/shared';
import { MutationGate, type Mutant } from './mutation-gate.js';

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

function failClosed(filePath: string, reason: string): MutationRunReport {
  return {
    filePath, totalMutants: 0, sampledMutants: 0, killedMutants: 0,
    survivedMutants: 0, skippedCompileErrors: 0, scorePercent: 0,
    passedThreshold: false, baselinePassed: false, reason, survivors: []
  };
}

function findNearestFile(startDir: string, relTarget: string): string | null {
  let cur = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(cur, relTarget))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function findDependentTests(distDir: string, distJs: string, allTests: string[]): string[] {
  const entries = fs.readdirSync(distDir, { recursive: true }).map(String);
  const jsFiles = entries.filter(e => /\.(js|mjs|cjs)$/.test(e)).map(e => path.resolve(distDir, e));
  const rev = new Map<string, string[]>();
  const importRe = /(?:from|import\s*\(?|require\()\s*['"](\.[^'"]+)['"]/g;
  for (const file of jsFiles) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (err: unknown) { debugLogIgnored('mutation-runner:depScan', err); continue; }
    for (const m of text.matchAll(importRe)) {
      const raw = path.resolve(path.dirname(file), m[1]);
      const target = fs.existsSync(raw) ? raw : ([`${raw}.js`, `${raw}.mjs`, `${raw}.cjs`].find(c => fs.existsSync(c)) ?? raw);
      const list = rev.get(target) ?? [];
      list.push(file);
      rev.set(target, list);
    }
  }
  const targetPath = path.resolve(distJs);
  const directSet = new Set(rev.get(targetPath) ?? []);
  const directTests = allTests.filter(t => directSet.has(path.resolve(t)));
  if (directTests.length > 0) return directTests;
  const visited = new Set<string>([targetPath]);
  const queue = [targetPath];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const imp of rev.get(cur) ?? []) {
      if (!visited.has(imp)) { visited.add(imp); queue.push(imp); }
    }
  }
  return allTests.filter(t => visited.has(path.resolve(t)));
}

function collectTestFiles(distDir: string, stem: string, distJs: string): string[] {
  if (!fs.existsSync(distDir)) return [];
  const entries = fs.readdirSync(distDir, { recursive: true }).map(String);
  const all = entries.filter(e => e.endsWith('.test.js') || e.endsWith('.test.mjs') || e.endsWith('.test.cjs')).map(e => path.join(distDir, e));
  const exact = all.filter(f => path.basename(f) === `${stem}.test.js` || path.basename(f) === `${stem}.test.mjs` || path.basename(f) === `${stem}.test.cjs`);
  if (exact.length > 0) return exact;
  const dependent = findDependentTests(distDir, distJs, all);
  return dependent.length > 0 ? dependent : all;
}

function buildBaseTestArgs(pkgRoot: string, testFiles: string[]): string[] {
  const root = findNearestFile(pkgRoot, path.join('scripts', 'test-workspace.cjs'));
  const pre = root ? ['--require', path.join(root, 'scripts', 'test-workspace.cjs')] : [];
  return [...pre, '--test', '--test-timeout=20000', ...testFiles];
}

function resolveTargetContext(options: RunFileMutationTestOptions): TargetContext | MutationRunReport {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : process.cwd();
  const targetTs = path.isAbsolute(options.filePath) ? path.resolve(options.filePath) : path.resolve(repoRoot, options.filePath);
  const relDisplay = path.relative(repoRoot, targetTs).replace(/\\/g, '/');
  const displayPath = relDisplay && !relDisplay.startsWith('..') ? relDisplay : options.filePath;
  if (!fs.existsSync(targetTs)) return failClosed(displayPath, `Source file not found: ${targetTs}`);
  const pkgRoot = findNearestFile(path.dirname(targetTs), 'package.json');
  if (!pkgRoot) return failClosed(displayPath, `Package root (package.json) not found for ${displayPath}`);
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
  const relFromSrc = path.relative(path.join(pkgRoot, 'src'), targetTs);
  if (!relFromSrc || relFromSrc.startsWith('..') || path.isAbsolute(relFromSrc)) {
    return failClosed(displayPath, `Target file must be inside package src/: ${displayPath}`);
  }
  const distJs = path.join(pkgRoot, 'dist', relFromSrc.replace(/\.mts$/, '.mjs').replace(/\.cts$/, '.cjs').replace(/\.ts$/, '.js'));
  if (!fs.existsSync(distJs)) return failClosed(displayPath, `Compiled dist target not found: ${distJs}`);
  const stem = path.basename(targetTs).replace(/\.(ts|mts|cts)$/, '');
  const testFiles = collectTestFiles(path.join(pkgRoot, 'dist'), stem, distJs);
  if (testFiles.length === 0) return failClosed(displayPath, `No compiled unit tests (*.test.js) found in ${path.join(pkgRoot, 'dist')}`);
  return { displayPath, targetTs, pkgRoot, distJs, isEsm, baseArgs: buildBaseTestArgs(pkgRoot, testFiles) };
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

const NORM_JS = [
  "const norm = (p) => { try { p = fs.realpathSync(p); } catch (e) { if (process.env.AEGIS_DEBUG === '1') process.stderr.write(String(e)); }",
  "  return process.platform === 'win32' ? p.toLowerCase() : p; };"
].join('\n');

function writeHookFiles(tempDir: string): { preloadCjs: string; hooksMjs: string; mutantFile: string } {
  const preloadCjs = path.join(tempDir, 'preload.cjs');
  const hooksMjs = path.join(tempDir, 'hooks.mjs');
  const mutantFile = path.join(tempDir, 'mutant.js');
  fs.writeFileSync(hooksMjs, [
    "import fs from 'node:fs';\nimport { fileURLToPath } from 'node:url';", NORM_JS,
    "const targetNorm = process.env.AEGIS_MUTANT_TARGET ? norm(process.env.AEGIS_MUTANT_TARGET) : '';",
    "export async function load(url, context, nextLoad) {",
    "  if (targetNorm && process.env.AEGIS_MUTANT_FILE && url.startsWith('file:')) {",
    "    try { if (norm(fileURLToPath(url)) === targetNorm) return { format: 'module', shortCircuit: true, source: fs.readFileSync(process.env.AEGIS_MUTANT_FILE, 'utf8') }; }",
    "    catch (e) { if (process.env.AEGIS_DEBUG === '1') process.stderr.write(String(e)); }",
    "  } return nextLoad(url, context); }"
  ].join('\n'), 'utf8');
  fs.writeFileSync(preloadCjs, [
    "const fs = require('node:fs');\nconst Module = require('node:module');\nconst { pathToFileURL } = require('node:url');", NORM_JS,
    "const targetNorm = process.env.AEGIS_MUTANT_TARGET ? norm(process.env.AEGIS_MUTANT_TARGET) : '';",
    "if (process.env.AEGIS_MUTANT_ESM === '1' && process.env.AEGIS_MUTANT_HOOKS && typeof Module.register === 'function') {",
    "  Module.register(pathToFileURL(process.env.AEGIS_MUTANT_HOOKS).href);",
    "} else if (targetNorm && process.env.AEGIS_MUTANT_FILE) {",
    "  for (const ext of ['.js', '.cjs']) {",
    "    const orig = Module._extensions[ext];",
    "    if (orig) {",
    "      Module._extensions[ext] = function patched(mod, filename) {",
    "        if (norm(filename) === targetNorm) return mod._compile(fs.readFileSync(process.env.AEGIS_MUTANT_FILE, 'utf8'), filename);",
    "        return orig.call(this, mod, filename); }; } } }"
  ].join('\n'), 'utf8');
  return { preloadCjs, hooksMjs, mutantFile };
}

function executeSampledMutants(
  ctx: TargetContext, sampled: CompiledMutant[], totalMutants: number, skippedCompileErrors: number, thresholdPercent: number, testTimeoutMs: number
): MutationRunReport {
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
  return executeSampledMutants(resolved, sampleMutants(compiled, maxMutants), mutants.length, skipped, threshold, mutantTimeout);
}
