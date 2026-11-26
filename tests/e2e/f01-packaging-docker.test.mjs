import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import {
  REPO_ROOT,
  CLI_BIN,
  createTempWorkspace,
  initTempGitRepo,
  readPackageJson,
  runNode,
  runNpm
} from './helpers/cli-runner.mjs';
import { listAllWorkspacePackages } from './helpers/gate-helpers.mjs';

const require = createRequire(import.meta.url);

function resolveExportTargets(pkgDir, exportsField) {
  const targets = [];
  const collect = (val) => {
    if (typeof val === 'string') targets.push(path.resolve(pkgDir, val));
    else if (val && typeof val === 'object') {
      for (const sub of Object.values(val)) collect(sub);
    }
  };
  collect(exportsField);
  return targets;
}

function linkTypescriptModule(runtimeDir) {
  const tsSrc = path.join(REPO_ROOT, 'node_modules', 'typescript');
  const nmDir = path.join(runtimeDir, 'node_modules');
  fs.mkdirSync(nmDir, { recursive: true });
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(tsSrc, path.join(nmDir, 'typescript'), linkType);
}

function testCliDepsAndTypescript() {
  const cliPkg = readPackageJson('packages/cli/package.json');
  const deps = cliPkg.dependencies ?? {};
  const internalDeps = Object.keys(deps).filter((k) => k.startsWith('@aegis/'));
  assert.deepEqual(internalDeps, [], `Unexpected @aegis/* runtime dependencies: ${internalDeps.join(', ')}`);
  assert.equal(typeof deps.typescript, 'string', '@aegis/cli dependencies must declare typescript');
}

function testAllPackageExports() {
  const pkgs = listAllWorkspacePackages();
  assert.equal(pkgs.length, 14, `Expected 14 workspace packages, got ${pkgs.length}`);
  for (const rel of pkgs) {
    const manifest = readPackageJson(rel);
    assert.ok(manifest.exports, `${rel} is missing "exports" field`);
    const pkgDir = path.dirname(path.join(REPO_ROOT, rel));
    const targets = resolveExportTargets(pkgDir, manifest.exports);
    assert.ok(targets.length > 0, `${rel} "exports" resolved to zero targets`);
    for (const target of targets) {
      if (target.includes('*')) continue;
      assert.ok(fs.existsSync(target), `${rel} export target missing on disk: ${target}`);
    }
  }
}

function testNoCollidingTrBinOrScript() {
  const cliPkg = readPackageJson('packages/cli/package.json');
  const rootPkg = readPackageJson('package.json');
  assert.equal(cliPkg.bin?.tr, undefined, '@aegis/cli bin must not register colliding "tr"');
  assert.equal(rootPkg.scripts?.tr, undefined, 'Root package.json scripts must not define "tr"');
  const setupSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts/setup-aegis-config.cjs'), 'utf8');
  assert.equal(/['"]tr['"]\s*,/.test(setupSrc), false, 'setup-aegis-config.cjs must not install "tr" shim');
}

function testRootSmolTomlDevDep() {
  const rootPkg = readPackageJson('package.json');
  assert.equal(
    typeof rootPkg.devDependencies?.['smol-toml'],
    'string',
    'Root package.json devDependencies must include smol-toml'
  );
}

function testReleaseWorkflowGates() {
  const yml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
  assert.match(yml, /npm run typecheck/, 'release.yml must run npm run typecheck');
  assert.match(yml, /npm run lint/, 'release.yml must run npm run lint');
  assert.match(yml, /cage:check/, 'release.yml must run cage:check before publish');
}

function hasDockerfileTypescriptProvisioning(dockerfile) {
  if (/^\s*(?:RUN|COPY)\b(?:[^\n]*\\\r?\n)*[^\n]*typescript/m.test(dockerfile)) return true;
  const copyMatch = /^\s*COPY\s+packages\/cli\/package\.json\b/m.exec(dockerfile);
  const runMatch = /^\s*RUN\b(?:[^\n]*\\\r?\n)*[^\n]*\bnpm\s+(?:install|ci)\b(?:[^\n]*\\\r?\n)*[^\n]*--omit=dev\b/m.exec(dockerfile);
  if (!copyMatch || !runMatch || copyMatch.index > runMatch.index) return false;
  const cliPkg = readPackageJson('packages/cli/package.json');
  return typeof cliPkg.dependencies?.typescript === 'string';
}

function testDockerignoreAndDockerfile() {
  const dockerignore = path.join(REPO_ROOT, '.dockerignore');
  assert.ok(fs.existsSync(dockerignore), '.dockerignore must exist at repo root');
  const ignoreText = fs.readFileSync(dockerignore, 'utf8');
  for (const entry of ['.git', 'node_modules', '.aegis']) {
    assert.ok(ignoreText.includes(entry), `.dockerignore must exclude ${entry}`);
  }
  const dockerfile = fs.readFileSync(path.join(REPO_ROOT, 'docker/agent-runtime.Dockerfile'), 'utf8');
  assert.ok(
    hasDockerfileTypescriptProvisioning(dockerfile),
    'Dockerfile must provision typescript directly or via COPY packages/cli/package.json + npm install --omit=dev'
  );
}

function testBundledOutputsHaveNoInternalImports() {
  const binPath = CLI_BIN;
  const idxPath = path.join(REPO_ROOT, 'packages/cli/dist/index.js');
  assert.ok(fs.existsSync(binPath), 'dist/bin/aegis.js must exist');
  assert.ok(fs.existsSync(idxPath), 'dist/index.js must exist');
  const binSrc = fs.readFileSync(binPath, 'utf8');
  const idxSrc = fs.readFileSync(idxPath, 'utf8');
  const importRe = /\b(?:from|import\s*\(?|require\s*\()\s*['"]@aegis\//;
  assert.equal(importRe.test(binSrc), false, 'dist/bin/aegis.js must not import @aegis/*');
  assert.equal(importRe.test(idxSrc), false, 'dist/index.js must not import @aegis/*');
}

function testIsolatedRuntimeWithTypescript(t) {
  const ws = createTempWorkspace('aegis-f01-rt-');
  t.after(ws.cleanup);
  const binCopy = path.join(ws.dir, 'aegis.js');
  fs.copyFileSync(CLI_BIN, binCopy);
  linkTypescriptModule(ws.dir);
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/ok.ts'), 'export const x: number = 1;\n', 'utf8');
  const ver = runNode([binCopy, '--version'], { cwd: ws.dir });
  assert.equal(ver.status, 0, `Isolated --version failed: ${ver.stderr}`);
  const cage = runNode([binCopy, 'cage:check', 'src', '--no-cache'], { cwd: ws.dir });
  assert.equal(cage.status, 0, `Isolated cage:check failed: ${cage.stdout}\n${cage.stderr}`);
}

function testExtensionlessBinaryInTempGitRepo(t) {
  const ws = createTempWorkspace('aegis-f01-ext-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const binDir = path.join(ws.dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const extless = path.join(binDir, 'aegis');
  fs.copyFileSync(CLI_BIN, extless);
  linkTypescriptModule(binDir);
  const res = runNode([extless, 'status'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, `Extensionless aegis status failed: ${res.stderr}`);
}

function testIsolatedRuntimeMissingTypescriptFailsCleanly(t) {
  const ws = createTempWorkspace('aegis-f01-nots-');
  t.after(ws.cleanup);
  const binCopy = path.join(ws.dir, 'aegis.js');
  fs.copyFileSync(CLI_BIN, binCopy);
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/ok.ts'), 'export const x = 1;\n', 'utf8');
  const cage = runNode([binCopy, 'cage:check', 'src', '--no-cache'], { cwd: ws.dir });
  assert.notEqual(cage.status, 0, 'Missing typescript must fail non-zero');
  assert.match(cage.stderr + cage.stdout, /typescript/i);
}

function testNpmPackDryRunManifest() {
  const cliPkg = readPackageJson('packages/cli/package.json');
  const starDeps = Object.entries(cliPkg.dependencies ?? {}).filter(([, v]) => v === '*');
  assert.deepEqual(starDeps, [], `Published CLI must not have "*" dependencies: ${JSON.stringify(starDeps)}`);
  const pack = runNpm(['pack', '--workspace=@aegis/cli', '--dry-run', '--json'], { timeoutMs: 30000 });
  assert.equal(pack.status, 0, `npm pack --dry-run failed: ${pack.stderr}`);
  const parsed = JSON.parse(pack.stdout);
  const paths = new Set((parsed[0]?.files ?? []).map((f) => f.path));
  assert.ok(paths.has('dist/bin/aegis.js'), 'Tarball missing dist/bin/aegis.js');
  assert.ok(paths.has('dist/index.js'), 'Tarball missing dist/index.js');
}

function testUserShimInstallSkipsCollidingTr(t) {
  const ws = createTempWorkspace('aegis-f01-shim-');
  t.after(ws.cleanup);
  const { installUserShims } = require(path.join(REPO_ROOT, 'scripts/setup-aegis-config.cjs'));
  const files = installUserShims(REPO_ROOT, ws.dir, 'linux');
  const names = files.map((f) => path.basename(f));
  assert.ok(names.includes('aegis'), 'Expected aegis shim');
  assert.ok(names.includes('tw'), 'Expected tw shim');
  assert.equal(names.includes('tr'), false, 'installUserShims must not emit colliding tr shim');
}

function registerTier1() {
  test('T1.1 @aegis/cli moves @aegis/* to devDeps and declares typescript', testCliDepsAndTypescript);
  test('T1.2 all 14 workspace packages declare valid exports', testAllPackageExports);
  test('T1.3 colliding "tr" bin, script, and shim are removed', testNoCollidingTrBinOrScript);
  test('T1.4 root devDependencies declares smol-toml', testRootSmolTomlDevDep);
  test('T1.5 release.yml runs typecheck, lint, and cage:check gates', testReleaseWorkflowGates);
  test('T1.6 .dockerignore exists and Dockerfile provisions typescript', testDockerignoreAndDockerfile);
}

function registerTier2() {
  test('T2.1 bundled dist/bin/aegis.js and dist/index.js have no @aegis/* imports', testBundledOutputsHaveNoInternalImports);
  test('T2.2 isolated runtime with typescript runs --version and cage:check', testIsolatedRuntimeWithTypescript);
  test('T2.3 extensionless binary copy runs status in isolated git repo', testExtensionlessBinaryInTempGitRepo);
  test('T2.4 isolated runtime without typescript fails cleanly on cage:check', testIsolatedRuntimeMissingTypescriptFailsCleanly);
  test('T2.5 npm pack dry-run includes bundled entrypoints without "*" deps', testNpmPackDryRunManifest);
  test('T2.6 installUserShims skips colliding tr shim', testUserShimInstallSkipsCollidingTr);
}

describe('Tier 1: F01 Packaging & Docker Contracts', registerTier1);
describe('Tier 2: F01 Isolated Runtime & Tarball Integration', registerTier2);
