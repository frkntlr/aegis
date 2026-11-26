import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored } from '@aegis/shared';

const NORM_JS = [
  "const norm = (p) => { try { p = fs.realpathSync(p); } catch (e) { if (process.env.AEGIS_DEBUG === '1') process.stderr.write(String(e)); }",
  "  return process.platform === 'win32' ? p.toLowerCase() : p; };"
].join('\n');

export function findNearestFile(startDir: string, relTarget: string): string | null {
  let cur = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(cur, relTarget))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function buildReverseImportGraph(distDir: string): Map<string, string[]> {
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
  return rev;
}

export function findDependentTests(distDir: string, distJs: string, allTests: string[]): string[] {
  const rev = buildReverseImportGraph(distDir);
  const targetPath = path.resolve(distJs);
  const directSet = new Set(rev.get(targetPath) ?? []);
  const directTests = allTests.filter(t => directSet.has(path.resolve(t)));
  if (directTests.length > 0) return directTests;
  const visited = new Set<string>([targetPath]);
  const queue = [targetPath];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) continue;
    for (const imp of rev.get(cur) ?? []) {
      if (!visited.has(imp)) { visited.add(imp); queue.push(imp); }
    }
  }
  return allTests.filter(t => visited.has(path.resolve(t)));
}

export function collectTestFiles(distDir: string, stem: string, distJs: string): string[] {
  if (!fs.existsSync(distDir)) return [];
  const entries = fs.readdirSync(distDir, { recursive: true }).map(String);
  const all = entries.filter(e => e.endsWith('.test.js') || e.endsWith('.test.mjs') || e.endsWith('.test.cjs')).map(e => path.join(distDir, e));
  const exact = all.filter(f => path.basename(f) === `${stem}.test.js` || path.basename(f) === `${stem}.test.mjs` || path.basename(f) === `${stem}.test.cjs`);
  if (exact.length > 0) return exact;
  const dependent = findDependentTests(distDir, distJs, all);
  return dependent.length > 0 ? dependent : all;
}

export function buildBaseTestArgs(pkgRoot: string, testFiles: string[]): string[] {
  const root = findNearestFile(pkgRoot, path.join('scripts', 'test-workspace.cjs'));
  const pre = root ? ['--require', path.join(root, 'scripts', 'test-workspace.cjs')] : [];
  return [...pre, '--test', '--test-timeout=20000', ...testFiles];
}

export function writeHookFiles(tempDir: string): { preloadCjs: string; hooksMjs: string; mutantFile: string } {
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
