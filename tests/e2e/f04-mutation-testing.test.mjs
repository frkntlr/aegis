import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import {
  REPO_ROOT,
  CLI_BIN,
  createTempWorkspace,
  initTempGitRepo,
  runAegisCli,
  runGit
} from './helpers/cli-runner.mjs';
import { writeTempModuleWithTest } from './helpers/gate-helpers.mjs';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function transpileEsm(code, fileName) {
  return ts.transpileModule(code, {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, esModuleInterop: true }
  }).outputText;
}

function setupTsWorkspace(ws, relSrc, srcCode, relTest, testCode) {
  const distRelSrc = relSrc.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js');
  const distRelTest = relTest.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js');
  fs.writeFileSync(path.join(ws.dir, 'package.json'), JSON.stringify({
    name: 'tmp-mutate',
    type: 'module',
    scripts: { test: `node --test ${distRelTest}` }
  }));
  const srcPair = writeTempModuleWithTest(ws.dir, relSrc, srcCode, relTest, testCode);
  const distTestSrc = testCode.replace(/(['"]\.\/[^'"]+)\.ts(['"])/g, '$1.js$2');
  const distPair = writeTempModuleWithTest(
    ws.dir,
    distRelSrc,
    transpileEsm(srcCode, relSrc),
    distRelTest,
    transpileEsm(distTestSrc, relTest)
  );
  return { ...srcPair, distSrcPath: distPair.srcPath, distTestPath: distPair.testPath };
}

const STRONG_SRC = [
  'export function add(a: number, b: number): number { return a + b; }',
  'export function isAdult(age: number): boolean { return age >= 18; }',
  ''
].join('\n');

const STRONG_TEST = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { add, isAdult } from './calc.ts';",
  "test('add and isAdult', () => {",
  '  assert.equal(add(2, 3), 5);',
  '  assert.equal(isAdult(18), true);',
  '  assert.equal(isAdult(17), false);',
  '});',
  ''
].join('\n');

function testStrongSuitePassesMutationGate(t) {
  const ws = createTempWorkspace('aegis-f04-strong-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  setupTsWorkspace(ws, 'src/calc.ts', STRONG_SRC, 'src/calc.test.ts', STRONG_TEST);
  const res = runAegisCli(['mutate', 'src/calc.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, `Expected pass on well-tested file:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /PASSED/i);
}

function testHollowSuiteFailsMutationGate(t) {
  const ws = createTempWorkspace('aegis-f04-hollow-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const hollowTest = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('hollow', () => { assert.equal(1, 1); });\n";
  setupTsWorkspace(ws, 'src/calc.ts', STRONG_SRC, 'src/calc.test.ts', hollowTest);
  const res = runAegisCli(['mutate', 'src/calc.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0, 'Hollow test suite that does not exercise module must fail mutation gate');
  assert.match(res.stdout, /Baseline Tests:\s+PASSED/, 'Hollow suite must pass baseline before failing mutation score');
  assert.match(res.stdout, /Total Mutants Generated:\s+[1-9]\d*/, 'Hollow suite must generate real mutants');
}

function testMutateDetectsUnstagedModifiedFile(t) {
  const ws = createTempWorkspace('aegis-f04-unstaged-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  setupTsWorkspace(ws, 'src/mod.ts', STRONG_SRC, 'src/mod.test.ts', STRONG_TEST.replace('./calc.ts', './mod.ts'));
  runGit(['add', '.'], ws.dir);
  runGit(['commit', '-m', 'add mod'], ws.dir);
  fs.writeFileSync(path.join(ws.dir, 'unrelated.txt'), 'unrelated change\n', 'utf8');
  runGit(['add', 'unrelated.txt'], ws.dir);
  runGit(['commit', '-m', 'add unrelated'], ws.dir);
  fs.writeFileSync(path.join(ws.dir, 'src/mod.ts'), `${STRONG_SRC}export const flag: boolean = true;\n`, 'utf8');
  const res = runAegisCli(['mutate'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.match(res.stdout, /src\/mod\.ts/, 'aegis mutate without args must detect unstaged modified .ts file');
}

function testVerifyDetectsUntrackedViolatingFile(t) {
  const ws = createTempWorkspace('aegis-f04-untracked-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/bad-new.ts'), 'export const bad: any = 42;\n', 'utf8');
  const res = runAegisCli(['verify'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0, 'aegis verify must fail on untracked violating file');
  assert.match(res.stdout + res.stderr, /bad-new\.ts/);
}

function testMutationDoesNotMutateDistOrSourceOnDisk(t) {
  const ws = createTempWorkspace('aegis-f04-immut-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const { srcPath, distSrcPath } = setupTsWorkspace(ws, 'src/calc.ts', STRONG_SRC, 'src/calc.test.ts', STRONG_TEST);
  const beforeSrc = sha256(srcPath);
  const beforeDist = sha256(distSrcPath);
  const beforeCli = sha256(CLI_BIN);
  const res = runAegisCli(['mutate', 'src/calc.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, `Expected pass on well-tested file:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /Baseline Tests:\s+PASSED/);
  assert.equal(sha256(srcPath), beforeSrc, 'Target source file must remain untouched on disk');
  assert.equal(sha256(distSrcPath), beforeDist, 'Compiled dist target must remain untouched on disk');
  assert.equal(sha256(CLI_BIN), beforeCli, 'CLI dist bundle must remain untouched on disk');
}

function testMissingTargetFileFailsClosed(t) {
  const ws = createTempWorkspace('aegis-f04-missing-');
  t.after(ws.cleanup);
  const res = runAegisCli(['mutate', 'does-not-exist.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr + res.stdout, /not found/i);
}

function testSyntaxErrorFileFailsClosed(t) {
  const ws = createTempWorkspace('aegis-f04-syn-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const badSrc = 'export function broken(a: number) { return a + ; }\n';
  const badTest = "import { test } from 'node:test';\nimport { broken } from './broken.ts';\ntest('x', () => { broken(1); });\n";
  setupTsWorkspace(ws, 'src/broken.ts', badSrc, 'src/broken.test.ts', badTest);
  const res = runAegisCli(['mutate', 'src/broken.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0, 'Syntax error target with failing import must fail closed');
  assert.match(res.stdout, /Baseline Tests:\s+FAILED/);
}

function testZeroMutantInterfaceFilePassesCleanly(t) {
  const ws = createTempWorkspace('aegis-f04-iface-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const iface = 'export interface Shape {\n  width: number;\n  height: number;\n}\n';
  const noopTest = "import { test } from 'node:test';\ntest('types', () => {});\n";
  setupTsWorkspace(ws, 'src/types.ts', iface, 'src/types.test.ts', noopTest);
  const res = runAegisCli(['mutate', 'src/types.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Baseline Tests:\s+PASSED/);
  assert.match(res.stdout, /Total Mutants Generated:\s+0/);
}

function testFailingBaselineTestFailsClosed(t) {
  const ws = createTempWorkspace('aegis-f04-basefail-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const failingTest = [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { add } from './calc.ts';",
    "test('fails baseline', () => { assert.equal(add(1, 2), 999); });",
    ''
  ].join('\n');
  setupTsWorkspace(ws, 'src/calc.ts', STRONG_SRC, 'src/calc.test.ts', failingTest);
  const res = runAegisCli(['mutate', 'src/calc.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0, 'Failing baseline test suite must fail closed');
  assert.match(res.stdout, /Baseline Tests:\s+FAILED/);
}

function testBoundarySurvivorAndTestFileExclusion(t) {
  const ws = createTempWorkspace('aegis-f04-bnd-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const weakSrc = 'export function add(a: number, b: number): number { return a + b; }\nexport function gt(n: number): boolean { return n > 0; }\n';
  const weakTest = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, gt } from './weak.ts';\ntest('partial', () => { assert.equal(add(1, 2), 3); assert.equal(typeof gt(5), 'boolean'); });\n";
  setupTsWorkspace(ws, 'src/weak.ts', weakSrc, 'src/weak.test.ts', weakTest);
  const mutRes = runAegisCli(['mutate', 'src/weak.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(mutRes.status, 0, '50% mutant kill (<70%) must fail closed');
  assert.match(mutRes.stdout, /Baseline Tests:\s+PASSED/, 'Partial suite must pass baseline before failing threshold');
  assert.match(mutRes.stdout, /Total Mutants Generated:\s+[1-9]\d*/, 'Partial suite must generate mutants');
  assert.match(mutRes.stdout, /Mutation Score:\s+50%/);
  fs.writeFileSync(path.join(ws.dir, 'notes.md'), '# ignore\n', 'utf8');
  const verRes = runAegisCli(['verify'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.doesNotMatch(verRes.stdout + verRes.stderr, /notes\.md|weak\.test\.ts/);
}

async function testTelemetryTesterExportsRunFileMutationTest() {
  const entry = pathToFileURL(path.join(REPO_ROOT, 'packages/plugins/telemetry-tester/dist/index.js')).href;
  const mod = await import(entry);
  assert.equal(typeof mod.runFileMutationTest, 'function', '@aegis/telemetry-tester must export runFileMutationTest');
}

function registerTier1() {
  test('T1.1 well-tested .ts module passes aegis mutate', testStrongSuitePassesMutationGate);
  test('T1.2 hollow test suite fails aegis mutate non-zero', testHollowSuiteFailsMutationGate);
  test('T1.3 aegis mutate without args detects unstaged modified .ts file', testMutateDetectsUnstagedModifiedFile);
  test('T1.4 aegis verify without args detects untracked violating .ts file', testVerifyDetectsUntrackedViolatingFile);
  test('T1.5 aegis mutate leaves target source and dist/ untouched on disk', testMutationDoesNotMutateDistOrSourceOnDisk);
}

function registerTier2() {
  test('T2.1 non-existent target file exits non-zero', testMissingTargetFileFailsClosed);
  test('T2.2 syntax-error .ts file fails closed without hanging', testSyntaxErrorFileFailsClosed);
  test('T2.3 zero-mutant interface-only .ts file passes with 0 mutants', testZeroMutantInterfaceFilePassesCleanly);
  test('T2.4 failing baseline test suite fails closed', testFailingBaselineTestFailsClosed);
  test('T2.5 partial mutant survival (<70%) fails and .test.ts/.md are excluded', testBoundarySurvivorAndTestFileExclusion);
  test('T2.6 @aegis/telemetry-tester exports runFileMutationTest', testTelemetryTesterExportsRunFileMutationTest);
}

describe('Tier 1: F04 Mutation Runner & Change Detection', registerTier1);
describe('Tier 2: F04 Mutation Boundaries & Exclusions', registerTier2);
