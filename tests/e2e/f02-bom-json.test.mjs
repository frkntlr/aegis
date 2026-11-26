import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  createTempWorkspace,
  hasUtf8Bom,
  initTempGitRepo,
  runAegisCli
} from './helpers/cli-runner.mjs';
import { collectFiles, listAllWorkspacePackages } from './helpers/gate-helpers.mjs';

const BOM = '\uFEFF';

async function loadSharedModule() {
  const entry = pathToFileURL(path.join(REPO_ROOT, 'packages/shared/dist/index.js')).href;
  return import(entry);
}

function writeBomFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${BOM}${content}`, 'utf8');
}

function testPackageJsonFilesBomFree() {
  const targets = ['package.json', ...listAllWorkspacePackages()];
  const infected = targets.filter((rel) => hasUtf8Bom(path.join(REPO_ROOT, rel)));
  assert.deepEqual(infected, [], `UTF-8 BOM found in package.json: ${infected.join(', ')}`);
}

function testSourceAndScriptFilesBomFree() {
  const pkgFiles = collectFiles(path.join(REPO_ROOT, 'packages'), ['.ts', '.js', '.cjs', '.mjs']);
  const scriptFiles = collectFiles(path.join(REPO_ROOT, 'scripts'), ['.ts', '.js', '.cjs', '.mjs']);
  const infected = [...pkgFiles, ...scriptFiles]
    .filter((f) => hasUtf8Bom(f))
    .map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
  assert.deepEqual(infected, [], `UTF-8 BOM found in source/scripts: ${infected.join(', ')}`);
}

function testAegisMetadataFilesBomFree() {
  const aegisDir = path.join(REPO_ROOT, '.aegis');
  if (!fs.existsSync(aegisDir)) return;
  const files = collectFiles(aegisDir, ['.json', '.txt', '.md', '.jsonl'], ['wiki-cache', 'cache', 'reports']);
  const infected = files
    .filter((f) => hasUtf8Bom(f))
    .map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
  assert.deepEqual(infected, [], `UTF-8 BOM found in .aegis files: ${infected.join(', ')}`);
}

async function testSharedBomHelpersPreserveUnicode() {
  const shared = await loadSharedModule();
  assert.equal(typeof shared.stripBom, 'function', '@aegis/shared must export stripBom');
  assert.equal(typeof shared.safeParseJson, 'function', '@aegis/shared must export safeParseJson');
  assert.equal(typeof shared.readJsonSafe, 'function', '@aegis/shared must export readJsonSafe');
  const unicodePayload = '{"msg":"ğüşıöç 🚀"}';
  assert.equal(shared.stripBom(`${BOM}${unicodePayload}`), unicodePayload);
  assert.deepEqual(shared.safeParseJson(`${BOM}${unicodePayload}`), { msg: 'ğüşıöç 🚀' });
}

async function testSharedBomHelpersBoundaries(t) {
  const shared = await loadSharedModule();
  assert.equal(typeof shared.stripBom, 'function', '@aegis/shared must export stripBom');
  assert.equal(typeof shared.safeParseJson, 'function', '@aegis/shared must export safeParseJson');
  assert.equal(typeof shared.readJsonSafe, 'function', '@aegis/shared must export readJsonSafe');
  const ws = createTempWorkspace('aegis-f02-bnd-');
  t.after(ws.cleanup);
  const singleBomFile = path.join(ws.dir, 'single.json');
  writeBomFile(singleBomFile, '{"ok":true}');
  assert.equal(shared.stripBom(''), '');
  assert.equal(shared.stripBom(BOM), '');
  assert.equal(shared.stripBom(`${BOM}${BOM}{}`), `${BOM}{}`);
  assert.throws(() => shared.safeParseJson(`${BOM}{"broken":`), SyntaxError);
  assert.throws(() => shared.safeParseJson(`${BOM}${BOM}{"ok":true}`), SyntaxError);
  assert.throws(() => shared.safeParseJson(BOM), SyntaxError);
  assert.deepEqual(shared.readJsonSafe(singleBomFile), { ok: true });
}

function testCliTaskListWithBomInbox(t) {
  const ws = createTempWorkspace('aegis-f02-inbox-');
  t.after(ws.cleanup);
  const inboxPath = path.join(ws.dir, '.aegis/task-inbox.json');
  const payload = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    tasks: [{
      id: 1,
      issueNumber: 1,
      title: 'BOM Inbox Task',
      role: 'qa-hunter',
      worktree: 'experimental/qa',
      targetFiles: ['src/app.ts'],
      acceptanceCriteria: [],
      prompt: 'test',
      status: 'pending',
      stagedAt: new Date().toISOString()
    }]
  };
  writeBomFile(inboxPath, JSON.stringify(payload));
  const res = runAegisCli(['task:list'], {
    cwd: ws.dir,
    env: { AEGIS_WORKSPACE: ws.dir, AEGIS_INBOX_PATH: inboxPath }
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /BOM Inbox Task/);
  assert.match(res.stdout, /src\/app\.ts/);
}

function testCliLockStatusWithBomLocks(t) {
  const ws = createTempWorkspace('aegis-f02-locks-');
  t.after(ws.cleanup);
  const lockPath = path.join(ws.dir, '.aegis/locks.json');
  const metaPath = path.join(ws.dir, '.aegis/locks-meta.json');
  writeBomFile(lockPath, JSON.stringify({ 'src/app.ts': 'agent-a' }));
  writeBomFile(metaPath, JSON.stringify({ 'src/app.ts': { acquiredAt: Date.now(), pid: process.pid } }));
  const res = runAegisCli(['lock:status'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /src\/app\.ts/);
  const corruptFiles = fs.readdirSync(path.join(ws.dir, '.aegis')).filter((n) => n.includes('.corrupt.'));
  assert.deepEqual(corruptFiles, [], 'Valid BOM locks.json must not be quarantined as corrupt');
}

function testCliLoopStatusWithBomJson(t) {
  const ws = createTempWorkspace('aegis-f02-loop-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const loopPath = path.join(ws.dir, '.aegis/loop_breaker.json');
  const record = { 42: { attempts: 3, lastError: 'boom', firstFailedAt: 1, lastFailedAt: 2, blocked: true } };
  writeBomFile(loopPath, JSON.stringify(record));
  const res = runAegisCli(['loop:status'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /#42|42/);
  assert.doesNotMatch(res.stdout, /All tasks clean/i);
}

function testCliDepsDriftWithBomPackageJson(t) {
  const ws = createTempWorkspace('aegis-f02-deps-');
  t.after(ws.cleanup);
  writeBomFile(path.join(ws.dir, 'package.json'), JSON.stringify({ name: 'root-tmp', private: true }));
  writeBomFile(path.join(ws.dir, 'turbo.json'), JSON.stringify({ tasks: {} }));
  writeBomFile(path.join(ws.dir, 'packages/a/package.json'), JSON.stringify({ name: '@tmp/a', version: '1.0.0' }));
  writeBomFile(path.join(ws.dir, 'packages/a/tsconfig.json'), JSON.stringify({ compilerOptions: { composite: true } }));
  const res = runAegisCli(['deps:drift'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Packages Scanned:\s+1/);
}

function testCliRejectsTruncatedAndEmptyBomJson(t) {
  const ws = createTempWorkspace('aegis-f02-bad-');
  t.after(ws.cleanup);
  const badJson = path.join(ws.dir, 'truncated.json');
  const emptyBom = path.join(ws.dir, 'empty-bom.json');
  writeBomFile(badJson, '{"a":');
  writeBomFile(emptyBom, '');
  const r1 = runAegisCli(['inspect', badJson], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  const r2 = runAegisCli(['inspect', emptyBom], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(r1.status, 0, 'Truncated BOM JSON must fail closed');
  assert.notEqual(r2.status, 0, 'BOM-only empty JSON must fail closed');
}

function registerTier1() {
  test('T1.1 root and all 14 package.json files have zero UTF-8 BOMs', testPackageJsonFilesBomFree);
  test('T1.2 source and script files under packages/ and scripts/ have zero UTF-8 BOMs', testSourceAndScriptFilesBomFree);
  test('T1.3 .aegis metadata files have zero UTF-8 BOMs', testAegisMetadataFilesBomFree);
  test('T1.4 @aegis/shared exports BOM helpers and preserves unicode', testSharedBomHelpersPreserveUnicode);
  test('T1.5 @aegis/shared BOM helpers handle empty, double-BOM, and truncated JSON', testSharedBomHelpersBoundaries);
}

function registerTier2() {
  test('T2.1 aegis task:list reads BOM-prefixed task-inbox.json', testCliTaskListWithBomInbox);
  test('T2.2 aegis lock:status reads BOM-prefixed locks.json without corrupt quarantine', testCliLockStatusWithBomLocks);
  test('T2.3 aegis loop:status reads BOM-prefixed loop_breaker.json', testCliLoopStatusWithBomJson);
  test('T2.4 aegis deps:drift parses BOM-prefixed package.json manifests', testCliDepsDriftWithBomPackageJson);
  test('T2.5 aegis inspect fails closed on truncated BOM JSON and BOM-only file', testCliRejectsTruncatedAndEmptyBomJson);
}

describe('Tier 1: F02 UTF-8 BOM Hygiene & Shared Parsers', registerTier1);
describe('Tier 2: F02 Opaque-Box CLI BOM & Boundary Handling', registerTier2);
