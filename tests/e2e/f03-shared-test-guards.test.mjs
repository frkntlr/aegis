import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  createTempWorkspace,
  readPackageJson,
  runExec,
  runNpm
} from './helpers/cli-runner.mjs';
import { collectFiles, listAllWorkspacePackages } from './helpers/gate-helpers.mjs';

async function loadSharedModule() {
  return import(pathToFileURL(path.join(REPO_ROOT, 'packages/shared/dist/index.js')).href);
}

function runManifestTestScript(testScript, cwd) {
  const resolvedScript = testScript.replace(/(?:\.\.\/)+scripts\//g, `${path.join(REPO_ROOT, 'scripts').replace(/\\/g, '/')}/`);
  return runExec(resolvedScript, [], { cwd, shell: true, timeoutMs: 20000 });
}

function testSharedPackageHasRealTestScript() {
  const pkg = readPackageJson('packages/shared/package.json');
  const script = pkg.scripts?.test ?? '';
  assert.notEqual(script.trim(), 'node --version', '@aegis/shared test script cannot be placeholder node --version');
  assert.match(script, /\.test\.js/, '@aegis/shared test script must run compiled *.test.js tests');
  assert.match(script, /!f\.length|length\s*===\s*0|process\.exit\(1\)/, '@aegis/shared test script must fail on empty suite');
}

function testSharedDeclaresTypesNode() {
  const pkg = readPackageJson('packages/shared/package.json');
  assert.equal(typeof pkg.devDependencies?.['@types/node'], 'string', '@aegis/shared must declare @types/node');
}

function testSharedDistContainsCompiledTests() {
  const distDir = path.join(REPO_ROOT, 'packages/shared/dist');
  const testFiles = collectFiles(distDir, ['.js'], []).filter((f) => f.endsWith('.test.js'));
  assert.ok(testFiles.length > 0, 'packages/shared/dist/ must contain compiled *.test.js files');
}

function testAllPackagesGuardEmptyTestSuites() {
  const pkgs = listAllWorkspacePackages();
  assert.equal(pkgs.length, 14);
  for (const rel of pkgs) {
    const manifest = readPackageJson(rel);
    const script = manifest.scripts?.test ?? '';
    assert.ok(script.length > 0, `${rel} missing test script`);
    assert.match(script, /!f\.length|length\s*===\s*0|throw/, `${rel} test script lacks non-empty suite guard`);
  }
}

async function testSharedPublicExportsExist() {
  const shared = await loadSharedModule();
  const expectedFns = ['resolveSafeRepoRoot', 'cleanGitEnv', 'FuzzyMatcher', 'PreEmptiveDiffBudgeting', 'DeprecationLinter', 'WorktreeMutexShield', 'GodotTopicResolver'];
  for (const name of expectedFns) {
    assert.equal(typeof shared[name], 'function', `@aegis/shared export missing: ${name}`);
  }
}

function testWorkspaceSharedTestPassesRealAssertions() {
  const res = runNpm(['test', '--workspace=@aegis/shared'], { timeoutMs: 30000 });
  assert.equal(res.status, 0, `npm test --workspace=@aegis/shared failed:\n${res.stdout}\n${res.stderr}`);
  const output = `${res.stdout}\n${res.stderr}`;
  assert.match(output, /pass\s+[1-9]\d*|ok\s+[1-9]\d*/i, 'Expected real passing test output from @aegis/shared');
}

function testEmptyDistGuardExitsNonZero(t) {
  const ws = createTempWorkspace('aegis-f03-empty-');
  t.after(ws.cleanup);
  fs.mkdirSync(path.join(ws.dir, 'dist'), { recursive: true });
  const sharedScript = readPackageJson('packages/shared/package.json').scripts?.test ?? '';
  const ironScript = readPackageJson('packages/core/iron-cage/package.json').scripts?.test ?? '';
  const sharedRes = runManifestTestScript(sharedScript, ws.dir);
  assert.notEqual(sharedRes.status, 0, '@aegis/shared empty dist must exit non-zero');
  assert.match(`${sharedRes.stdout}\n${sharedRes.stderr}`, /No test files found/i, '@aegis/shared must emit empty-suite guard message');
  const ironRes = runManifestTestScript(ironScript, ws.dir);
  assert.notEqual(ironRes.status, 0, '@aegis/iron-cage empty dist must exit non-zero');
  assert.match(`${ironRes.stdout}\n${ironRes.stderr}`, /No test files found/i, '@aegis/iron-cage must emit empty-suite guard message');
}

function testFailingCompiledTestPropagatesNonZero(t) {
  const ws = createTempWorkspace('aegis-f03-fail-');
  t.after(ws.cleanup);
  const distDir = path.join(ws.dir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'sample.test.js'), "const test = require('node:test'); test('boom', () => { throw new Error('fail'); });\n");
  const script = readPackageJson('packages/core/iron-cage/package.json').scripts?.test ?? '';
  const res = runManifestTestScript(script, ws.dir);
  const out = `${res.stdout}\n${res.stderr}`;
  assert.notEqual(res.status, 0, 'Failing compiled test must propagate non-zero exit');
  assert.match(out, /fail|boom|not ok/i, 'Expected failing test diagnostic output');
  assert.doesNotMatch(out, /\[eval\]|Unterminated string constant/i, 'Must not fail on shell quoting error');
}

function testSyntaxErrorCompiledTestFails(t) {
  const ws = createTempWorkspace('aegis-f03-syntax-');
  t.after(ws.cleanup);
  const distDir = path.join(ws.dir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'broken.test.js'), 'const x = (;\n', 'utf8');
  const script = readPackageJson('packages/core/iron-cage/package.json').scripts?.test ?? '';
  const res = runManifestTestScript(script, ws.dir);
  const out = `${res.stdout}\n${res.stderr}`;
  assert.notEqual(res.status, 0, 'Syntax error in test file must fail non-zero');
  assert.match(out, /SyntaxError/i, 'Expected SyntaxError from malformed test file');
  assert.match(out, /broken\.test\.js/i, 'Expected diagnostic referencing broken.test.js');
  assert.doesNotMatch(out, /\[eval\]|Unterminated string constant/i, 'Must not fail on shell quoting error');
}

function testPassingCompiledTestExitsZero(t) {
  const ws = createTempWorkspace('aegis-f03-pass-');
  t.after(ws.cleanup);
  const distDir = path.join(ws.dir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'sample.test.js'), "const test = require('node:test'); test('ok', () => {});\n", 'utf8');
  const sharedScript = readPackageJson('packages/shared/package.json').scripts?.test ?? '';
  const ironScript = readPackageJson('packages/core/iron-cage/package.json').scripts?.test ?? '';
  const sharedRes = runManifestTestScript(sharedScript, ws.dir);
  assert.equal(sharedRes.status, 0, `@aegis/shared passing test must exit 0:\n${sharedRes.stdout}\n${sharedRes.stderr}`);
  assert.match(`${sharedRes.stdout}\n${sharedRes.stderr}`, /pass\s+1|ok\s+1/i, '@aegis/shared must report passing test');
  const ironRes = runManifestTestScript(ironScript, ws.dir);
  assert.equal(ironRes.status, 0, `@aegis/iron-cage passing test must exit 0:\n${ironRes.stdout}\n${ironRes.stderr}`);
  assert.match(`${ironRes.stdout}\n${ironRes.stderr}`, /pass\s+1|ok\s+1/i, '@aegis/iron-cage must report passing test');
}

async function testSharedApiBoundaries(t) {
  const shared = await loadSharedModule();
  const ws = createTempWorkspace('aegis-f03-api-');
  t.after(ws.cleanup);
  const diff = shared.PreEmptiveDiffBudgeting.assessProposedDiff('a.ts', 301, 41);
  assert.equal(diff.allowed, false, 'PreEmptiveDiffBudgeting must reject >300 file or >40 func lines');
  const suggestion = shared.FuzzyMatcher.suggest('cage:chek', ['cage:check', 'status']);
  assert.equal(suggestion, 'cage:check');
  fs.mkdirSync(path.join(ws.dir, '.aegis'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, '.aegis/locks.json'), JSON.stringify({ 'src/x.ts': 'agent-1' }));
  fs.writeFileSync(path.join(ws.dir, '.aegis/locks-meta.json'), JSON.stringify({ 'src/x.ts': { acquiredAt: Date.now(), pid: process.pid } }));
  const lockCheck = shared.WorktreeMutexShield.inspectLock('experimental/solver/src/x.ts', 'agent-2', ws.dir);
  assert.equal(lockCheck?.isLockedByOther, true);
  assert.equal(lockCheck?.lockedBy, 'agent-1');
}

function registerTier1() {
  test('T1.1 @aegis/shared test script runs compiled tests with empty guard', testSharedPackageHasRealTestScript);
  test('T1.2 @aegis/shared devDependencies declares @types/node', testSharedDeclaresTypesNode);
  test('T1.3 @aegis/shared dist/ contains compiled *.test.js files', testSharedDistContainsCompiledTests);
  test('T1.4 all 14 workspace package test scripts guard empty suites', testAllPackagesGuardEmptyTestSuites);
  test('T1.5 @aegis/shared public API symbols are exported', testSharedPublicExportsExist);
}

function registerTier2() {
  test('T2.1 npm test --workspace=@aegis/shared runs real passing assertions', testWorkspaceSharedTestPassesRealAssertions);
  test('T2.2 package test script exits non-zero when dist/ has zero test files', testEmptyDistGuardExitsNonZero);
  test('T2.3 package test script propagates non-zero exit on failing test', testFailingCompiledTestPropagatesNonZero);
  test('T2.4 package test script fails non-zero on malformed test file', testSyntaxErrorCompiledTestFails);
  test('T2.5 @aegis/shared budgeting, fuzzy match, and lock shield boundaries', testSharedApiBoundaries);
  test('T2.6 package test script exits 0 on passing compiled test', testPassingCompiledTestExitsZero);
}

describe('Tier 1: F03 @aegis/shared Tests & Guard Contracts', registerTier1);
describe('Tier 2: F03 Guard Execution & Boundary Integration', registerTier2);
