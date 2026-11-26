import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  REPO_ROOT,
  CLI_BIN,
  createTempWorkspace,
  initTempGitRepo,
  readPackageJson,
  runAegisCli,
  runNode
} from './helpers/cli-runner.mjs';
import { listAllWorkspacePackages, writeTempModuleWithTest } from './helpers/gate-helpers.mjs';
import { readJsonSafe } from '../../packages/shared/dist/index.js';

function writeBom(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `\uFEFF${content}`, 'utf8');
}

function linkTs(dir) {
  const nm = path.join(dir, 'node_modules');
  fs.mkdirSync(nm, { recursive: true });
  fs.symlinkSync(
    path.join(REPO_ROOT, 'node_modules', 'typescript'),
    path.join(nm, 'typescript'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function setupIsoCiWorkspace(wsDir) {
  const cliTarget = path.join(wsDir, 'packages', 'cli', 'dist', 'bin', 'aegis.js');
  fs.mkdirSync(path.dirname(cliTarget), { recursive: true });
  fs.copyFileSync(CLI_BIN, cliTarget);
  linkTs(wsDir);
  fs.writeFileSync(path.join(wsDir, 'package.json'), JSON.stringify({
    name: 'iso-ci',
    private: true,
    workspaces: ['packages/*'],
    scripts: { test: 'node -e "process.exit(0)"' }
  }));
  fs.writeFileSync(path.join(wsDir, 'package-lock.json'), JSON.stringify({ name: 'iso-ci', lockfileVersion: 3 }));
  fs.mkdirSync(path.join(wsDir, 'packages', 'app', 'src'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'packages', 'app', 'package.json'), JSON.stringify({ name: '@iso/app', version: '1.0.0' }));
  fs.writeFileSync(path.join(wsDir, 'packages', 'app', 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', composite: true } }));
  fs.writeFileSync(path.join(wsDir, 'packages', 'app', 'src', 'ok.ts'), 'export const ok: number = 1;\n', 'utf8');
  return cliTarget;
}

function writeDistPair(wsDir, relJs, jsCode, relTestJs, testJsCode) {
  writeTempModuleWithTest(wsDir, relJs, jsCode, relTestJs, testJsCode);
}

function writeTelemetry(wsDir, nodes) {
  const telPath = path.join(wsDir, '.aegis', 'ui_telemetry.json');
  fs.mkdirSync(path.dirname(telPath), { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'aegis.config.json'), JSON.stringify({ godot: { aspectRatios: ['16:9'] } }));
  fs.writeFileSync(telPath, JSON.stringify({ nodes }));
}

function testP1IsolatedBundleBomStrictDepsAndCage(t) {
  const ws = createTempWorkspace('aegis-t3-p1-');
  t.after(ws.cleanup);
  const isoCli = path.join(ws.dir, 'aegis.js');
  fs.copyFileSync(CLI_BIN, isoCli);
  linkTs(ws.dir);
  writeBom(path.join(ws.dir, 'package.json'), JSON.stringify({ name: 'bom-iso', private: true, workspaces: ['packages/*'] }));
  writeBom(path.join(ws.dir, 'package-lock.json'), JSON.stringify({ name: 'bom-iso', lockfileVersion: 3 }));
  writeBom(path.join(ws.dir, 'turbo.json'), JSON.stringify({ tasks: {} }));
  writeBom(path.join(ws.dir, 'packages/app/package.json'), JSON.stringify({ name: '@bom/app', version: '1.0.0' }));
  writeBom(path.join(ws.dir, 'packages/app/tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', composite: true } }));
  fs.mkdirSync(path.join(ws.dir, 'packages/app/src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'packages/app/src/ok.ts'), 'export const ok: number = 1;\n', 'utf8');
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } };
  assert.equal(runNode([isoCli, 'deps:drift', '--strict'], opts).status, 1);
  assert.equal(runNode([isoCli, 'deps:sync'], opts).status, 0);
  assert.equal(runNode([isoCli, 'deps:drift', '--strict'], opts).status, 0);
  const cleanCage = runNode([isoCli, 'cage:check', 'packages/app/src', '--no-cache', '--json'], opts);
  assert.equal(cleanCage.status, 0);
  assert.equal(JSON.parse(cleanCage.stdout).clean, true);
  fs.appendFileSync(path.join(ws.dir, 'packages/app/src/ok.ts'), 'export const bad: any = 2;\n', 'utf8');
  const dirtyCage = runNode([isoCli, 'cage:check', 'packages/app/src', '--no-cache', '--json'], opts);
  assert.equal(dirtyCage.status, 1);
  assert.ok(JSON.parse(dirtyCage.stdout).violations.some((v) => v.rule === 'TS_001_NO_ANY'));
}

function testP2SharedBomParserAndFailClosedInspect(t) {
  const ws = createTempWorkspace('aegis-t3-p2-');
  t.after(ws.cleanup);
  const sharedPkg = readPackageJson('packages/shared/package.json');
  assert.ok(sharedPkg.scripts?.test?.includes('!f.length'), '@aegis/shared must guard empty test suite');
  const layoutPath = path.join(ws.dir, 'layout.json');
  writeBom(layoutPath, JSON.stringify([
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 50, y: 10, width: 100, height: 50 }
  ]));
  const parsed = readJsonSafe(layoutPath);
  assert.equal(parsed.length, 2);
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } };
  const overlapRes = runAegisCli(['inspect', layoutPath], opts);
  assert.notEqual(overlapRes.status, 0, 'Overlapping BOM layout must fail inspect');
  assert.match(overlapRes.stdout + overlapRes.stderr, /FAILED/i);
  const badJsonPath = path.join(ws.dir, 'broken.json');
  writeBom(badJsonPath, '{"broken":');
  assert.notEqual(runAegisCli(['inspect', badJsonPath], opts).status, 0, 'Malformed BOM JSON must fail closed');
}

function testP3UnstagedGitChangeMutateVerifyCage(t) {
  const ws = createTempWorkspace('aegis-t3-p3-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  fs.writeFileSync(path.join(ws.dir, 'package.json'), JSON.stringify({
    name: 'p3-unstaged',
    type: 'module',
    scripts: { test: 'node --test src/calc.test.ts' }
  }));
  const src = 'export function add(a: number, b: number): number { return a + b; }\n';
  const hollow = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('h', () => { assert.equal(1, 1); });\n";
  writeTempModuleWithTest(ws.dir, 'src/calc.ts', src, 'src/calc.test.ts', hollow);
  writeDistPair(ws.dir, 'dist/calc.js', 'export function add(a, b) { return a + b; }\n', 'dist/calc.test.js', hollow);
  const gitCommit = runAegisCli(['--version'], { cwd: ws.dir });
  assert.equal(gitCommit.status, 0);
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } };
  const verifyRes = runAegisCli(['verify'], opts);
  assert.equal(verifyRes.status, 0);
  fs.appendFileSync(path.join(ws.dir, 'src/calc.ts'), 'export const leaked: any = 1;\n', 'utf8');
  const failVerify = runAegisCli(['verify'], opts);
  assert.notEqual(failVerify.status, 0, 'verify must detect untracked/unstaged violating file');
  assert.match(failVerify.stdout + failVerify.stderr, /calc\.ts/);
  const mutRes = runAegisCli(['mutate'], opts);
  assert.notEqual(mutRes.status, 0, 'hollow suite must fail mutate');
  assert.match(mutRes.stdout, /src\/calc\.ts/);
  const cageRes = runAegisCli(['cage:check', 'src', '--no-cache', '--json'], opts);
  assert.equal(cageRes.status, 1);
  assert.ok(JSON.parse(cageRes.stdout).violations.some((v) => v.rule === 'TS_001_NO_ANY'));
}

function testP4IsolatedBundleCiAuditDepsParity(t) {
  const ws = createTempWorkspace('aegis-t3-p4-');
  t.after(ws.cleanup);
  const wsCli = setupIsoCiWorkspace(ws.dir);
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir }, timeoutMs: 30000 };
  const passAudit = runNode([wsCli, 'ci:audit', '--step=deps:drift', '--json'], opts);
  assert.equal(passAudit.status, 0, passAudit.stderr);
  const passJson = JSON.parse(passAudit.stdout);
  assert.equal(passJson.success, true);
  assert.equal(passJson.gates[0]?.id, 'deps:drift');
  fs.writeFileSync(path.join(ws.dir, 'packages/app/tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022' },
    references: [{ path: '../missing-pkg' }]
  }));
  const failAudit = runNode([wsCli, 'ci:audit', '--step=deps:drift', '--json'], opts);
  assert.equal(failAudit.status, 1, 'Broken project reference must fail ci:audit deps:drift');
  assert.equal(JSON.parse(failAudit.stdout).success, false);
  assert.equal(runNode([wsCli, 'ci:audit', '--step=nonexistent', '--json'], opts).status, 1);
}

function testP5MutateImmutabilityRadar299AndCompoundChecker(t) {
  const ws = createTempWorkspace('aegis-t3-p5-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  fs.writeFileSync(path.join(ws.dir, 'package.json'), JSON.stringify({
    name: 'p5-boundary',
    type: 'module',
    scripts: { test: 'node --test src/boundary.test.ts' }
  }));
  const pads = Array.from({ length: 297 }, (_, i) => `// pad ${i}`).join('\n');
  const src = `export function sum(a: number, b: number): number { return a + b; }\nexport function isPos(n: number): boolean { return n > 0; }\n${pads}\n`;
  const strongTest = [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { sum, isPos } from './boundary.ts';",
    "test('boundary', () => { assert.equal(sum(2, 3), 5); assert.equal(isPos(1), true); assert.equal(isPos(0), false); });",
    ''
  ].join('\n');
  const { srcPath } = writeTempModuleWithTest(ws.dir, 'src/boundary.ts', src, 'src/boundary.test.ts', strongTest);
  writeDistPair(ws.dir, 'dist/boundary.js', 'export function sum(a, b) { return a + b; }\nexport function isPos(n) { return n > 0; }\n', 'dist/boundary.test.js', strongTest.replace('./boundary.ts', './boundary.js'));
  const beforeSrc = sha256(srcPath);
  const beforeCli = sha256(CLI_BIN);
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } };
  assert.equal(runAegisCli(['mutate', 'src/boundary.ts'], opts).status, 0);
  assert.equal(sha256(srcPath), beforeSrc);
  assert.equal(sha256(CLI_BIN), beforeCli);
  const cage = runAegisCli(['cage:check', 'src', '--no-cache', '--json'], opts);
  assert.equal(cage.status, 0);
  const cageJson = JSON.parse(cage.stdout);
  assert.equal(cageJson.clean, true);
  assert.ok(cageJson.radarAlerts.some((a) => path.basename(a.file) === 'boundary.ts'));
  const ccCage = runAegisCli(['cage:check', 'packages/core/compound-checker/src', '--no-cache', '--json'], { cwd: REPO_ROOT });
  assert.equal(ccCage.status, 0);
  assert.equal(JSON.parse(ccCage.stdout).clean, true);
}

function testP6GodotInspectAndCiHookBiomeGuardParity(t) {
  const ciAudit = fs.readFileSync(path.join(REPO_ROOT, 'packages/cli/src/commands/ci-audit-command.ts'), 'utf8');
  const ciYml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.ok(ciAudit.includes('godot inspect') && ciYml.includes('godot inspect'), 'ci-audit & ci.yml must both include godot inspect');
  const biome = readPackageJson('biome.json');
  assert.ok(biome.files?.includes?.some((p) => p.includes('scripts')), 'biome.json must cover scripts');
  assert.equal(biome.linter?.rules?.suspicious?.noEmptyBlockStatements, 'error', 'biome must enable noEmptyBlockStatements');
  for (const hook of ['.githooks/pre-commit', '.githooks/pre-push']) {
    const content = fs.readFileSync(path.join(REPO_ROOT, hook), 'utf8');
    assert.ok(content.includes('lint') && content.includes('typecheck'), `${hook} must run lint & typecheck`);
  }
  for (const rel of listAllWorkspacePackages()) {
    assert.ok(readPackageJson(rel).scripts?.test?.includes('!f.length'), `${rel} missing !f.length guard`);
  }
  const ws = createTempWorkspace('aegis-t3-p6-');
  t.after(ws.cleanup);
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } };
  assert.equal(runAegisCli(['godot', 'inspect', ws.dir], opts).status, 1, 'Missing telemetry must fail closed');
  writeTelemetry(ws.dir, [
    { id: 'a', type: 'Button', visible: true, rect: { x: 0, y: 0, width: 100, height: 50 } },
    { id: 'b', type: 'Button', visible: true, rect: { x: 100, y: 0, width: 100, height: 50 } }
  ]);
  assert.equal(runAegisCli(['godot', 'inspect', ws.dir], opts).status, 0, 'Adjacent 0px gap must pass');
  writeTelemetry(ws.dir, [
    { id: 'a', type: 'Button', visible: true, rect: { x: 0, y: 0, width: 100, height: 50 } },
    { id: 'b', type: 'Button', visible: true, rect: { x: 99, y: 0, width: 100, height: 50 } }
  ]);
  assert.equal(runAegisCli(['godot', 'inspect', ws.dir], opts).status, 1, '1px overlap must exit 1');
}

function testP7VerifyTaskAndAuditFailClosed(t) {
  const ws = createTempWorkspace('aegis-t3-p7-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/bad.ts'), 'export const x: any = 1;\n', 'utf8');
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } };
  const verifyRes = runAegisCli(['verify:task', 'src/bad.ts'], opts);
  assert.equal(verifyRes.status, 1, 'verify:task must fail on violating file');
  const auditRes = runAegisCli(['audit', 'src/bad.ts'], opts);
  assert.equal(auditRes.status, 1, 'audit without test report/tests must fail closed');
  assert.equal(/Verdict:\s*APPROVED/.test(auditRes.stdout), false, 'audit must never approve without test evidence');
}

describe('Tier 3: Cross-Feature CLI & Quality Gates (F01-F06, F12)', () => {
  test('P1 (F01xF02xF06): Isolated bundle + BOM manifests + deps:drift/sync + cage:check', testP1IsolatedBundleBomStrictDepsAndCage);
  test('P2 (F02xF03xF05): Shared BOM parser + non-empty guard + fail-closed inspect', testP2SharedBomParserAndFailClosedInspect);
  test('P3 (F04xF05xF06): Unstaged/untracked git edits across verify -> mutate -> cage:check', testP3UnstagedGitChangeMutateVerifyCage);
  test('P4 (F01xF05xF06): Isolated bundle ci:audit --step=deps:drift parity', testP4IsolatedBundleCiAuditDepsParity);
  test('P5 (F04xF06xF12): Mutation immutability + 299-line radar + compound-checker cage', testP5MutateImmutabilityRadar299AndCompoundChecker);
  test('P6 (F03xF05xF06): godot inspect fail-closed + CI/hook/biome/test-guard parity', testP6GodotInspectAndCiHookBiomeGuardParity);
  test('P7 (F04xF05xF06): verify:task + audit fail-closed gate parity', testP7VerifyTaskAndAuditFailClosed);
});
