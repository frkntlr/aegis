import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT, buildCleanEnv, createTempWorkspace, initTempGitRepo, readPackageJson, runAegisCli, runNode
} from './helpers/cli-runner.mjs';
import { collectFiles, listAllWorkspacePackages } from './helpers/gate-helpers.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ORCH_URL = pathToFileURL(path.join(REPO_ROOT, 'packages/core/orchestrator/dist/index.js')).href;
const GHL_URL = pathToFileURL(path.join(REPO_ROOT, 'packages/core/github-live/dist/index.js')).href;
const WD_URL = pathToFileURL(path.join(REPO_ROOT, 'packages/core/watchdog/dist/index.js')).href;
const AST_URL = pathToFileURL(path.join(REPO_ROOT, 'packages/core/ast-skeleton/dist/index.js')).href;

async function testWorktreeLockManagerReentrancy(t) {
  const ws = createTempWorkspace('aegis-f11-lock-');
  t.after(ws.cleanup);
  const { WorktreeLockManager } = await import(ORCH_URL);
  const mgr = new WorktreeLockManager({ repoRoot: ws.dir, persistLocks: true });
  const lockDir = path.join(ws.dir, '.aegis', 'locks.json.lock');
  const start = Date.now();
  mgr.withLock(() => {
    assert.equal(fs.existsSync(lockDir), true, 'Outer lock directory must exist inside withLock');
    mgr.acquireFileLocks('solver-a', ['src/a.ts']);
    assert.equal(fs.existsSync(lockDir), true, 'Nested acquireFileLocks must not release outer lockDir');
    mgr.pruneStaleLocks();
    assert.equal(fs.existsSync(lockDir), true, 'Nested pruneStaleLocks must not release outer lockDir');
  });
  assert.equal(fs.existsSync(lockDir), false, 'Outer lock directory must be cleaned up on exit');
  assert.ok(Date.now() - start < 2000, 'Re-entrant withLock must not hit mutex timeout');
  assert.equal(mgr.getLockedFiles().get('src/a.ts'), 'solver-a');
}

async function testWorktreeManagerValidateAgentName(t) {
  const ws = createTempWorkspace('aegis-f11-wtname-');
  t.after(ws.cleanup);
  const { WorktreeManager } = await import(ORCH_URL);
  const mgr = new WorktreeManager({ repoRoot: ws.dir, persistLocks: false });
  assert.ok(mgr.getWorktreePath('solver-1').startsWith(path.join(ws.dir, 'experimental')));
  for (const bad of ['', '..', '../escape', '-flag', 'a/b', 'a\\b', 'agent.lock', 'x\0y']) {
    assert.throws(() => mgr.getWorktreePath(bad), /Invalid agent name/i, `Expected rejection for ${JSON.stringify(bad)}`);
  }
}

async function testBootstrapBranchValidationAndScaffold(t) {
  const ws = createTempWorkspace('aegis-f11-boot-');
  t.after(ws.cleanup);
  const { ProjectBootstrapEngine, validateGitBranchName } = await import(ORCH_URL);
  for (const bad of ['main; echo pwn', '--upload-pack=evil', 'a..b', 'branch.lock', '@{0}']) {
    assert.throws(() => validateGitBranchName(bad), /Invalid git branch name/i);
  }
  const res = ProjectBootstrapEngine.bootstrap(ws.dir, { defaultBranch: 'main', projectName: 'Demo' });
  assert.equal(res.initializedGit, true);
  assert.equal(res.createdAegis, true);
  for (const rel of ['.git', '.gitignore', 'README.md', 'docs/rfc', '.aegis/task-inbox.json']) {
    assert.ok(fs.existsSync(path.join(ws.dir, rel)), `Bootstrap missing ${rel}`);
  }
}

function testNodeSqliteFallbackAndDebugLog(t) {
  const ws = createTempWorkspace('aegis-f11-sqlite-');
  t.after(ws.cleanup);
  const script = [
    `const { AmbientCookieVaultExtractor, AmbientFirefoxVaultExtractor } = await import(${JSON.stringify(GHL_URL)});`,
    `const loader = () => { const e = new Error('No such built-in module: node:sqlite'); e.code = 'ERR_UNKNOWN_BUILTIN_MODULE'; throw e; };`,
    `const a = AmbientCookieVaultExtractor.querySqliteDatabase('dummy.sqlite', loader);`,
    `const b = AmbientFirefoxVaultExtractor.queryFirefoxSqlite('dummy.sqlite', loader);`,
    `console.log(JSON.stringify({ aLen: a.length, bLen: b.length }));`
  ].join('\n');
  const scriptPath = path.join(ws.dir, 'check-sqlite.mjs');
  fs.writeFileSync(scriptPath, script, 'utf8');
  const quiet = runNode([scriptPath], { cwd: ws.dir });
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.deepEqual(JSON.parse(quiet.stdout.trim()), { aLen: 0, bLen: 0 });
  assert.equal(quiet.stderr.includes('node:sqlite'), false);
  const loud = runNode([scriptPath], { cwd: ws.dir, env: { AEGIS_DEBUG: '1' } });
  assert.equal(loud.status, 0, loud.stderr);
  assert.match(loud.stderr, /notebooklm-sqlite:unsupported|>=22\.5/);
}

function scanFileForEmptyCatchAndShell(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  let emptyCatches = 0;
  let shellTrue = 0;
  const visit = (node) => {
    if (ts.isCatchClause(node) && node.block.statements.length === 0) emptyCatches++;
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'shell' && node.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      shellTrue++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { emptyCatches, shellTrue };
}

function testZeroEmptyCatchesAndShellTrueInPackages() {
  const pkgFiles = collectFiles(path.join(REPO_ROOT, 'packages'), ['.ts'])
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.d.ts') && f.includes(`${path.sep}src${path.sep}`));
  assert.ok(pkgFiles.length > 50, 'Expected >50 production TypeScript source files');
  let totalEmpty = 0;
  let totalShell = 0;
  for (const file of pkgFiles) {
    const { emptyCatches, shellTrue } = scanFileForEmptyCatchAndShell(file);
    totalEmpty += emptyCatches;
    totalShell += shellTrue;
  }
  assert.equal(totalShell, 0, `Expected 0 shell: true literals in production TS, found ${totalShell}`);
  assert.equal(totalEmpty, 0, `Expected 0 zero-statement catch blocks in production TS, found ${totalEmpty}`);
}

function testTurboAndWorkspaceTypecheckAlignment() {
  const turbo = readPackageJson('turbo.json');
  const outputs = turbo.tasks?.typecheck?.outputs ?? [];
  const pkgs = listAllWorkspacePackages();
  const usesNoEmit = pkgs.every((p) => (readPackageJson(p).scripts?.typecheck ?? '').includes('--noEmit'));
  if (usesNoEmit) {
    assert.equal(
      outputs.includes('dist/tsconfig.tsbuildinfo'),
      false,
      'turbo.json typecheck.outputs must not declare dist/tsconfig.tsbuildinfo when packages run tsc --noEmit'
    );
  }
}

function testRepoTaskInboxHygiene() {
  const inboxPath = path.join(REPO_ROOT, '.aegis', 'task-inbox.json');
  if (fs.existsSync(inboxPath)) {
    const tasks = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    const ids = tasks.map((item) => item.id).filter((v) => v !== undefined);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate task IDs found in .aegis/task-inbox.json');
  }
  const aegisEntries = fs.existsSync(path.join(REPO_ROOT, '.aegis'))
    ? fs.readdirSync(path.join(REPO_ROOT, '.aegis'))
    : [];
  const tmpResidue = aegisEntries.filter((n) => n.includes('.tmp'));
  assert.deepEqual(tmpResidue, [], `Unexpected .tmp residue in .aegis/: ${tmpResidue.join(', ')}`);
}

function testCliTeamworkPlanDeduplicatesInboxAndCleansTmp(t) {
  const ws = createTempWorkspace('aegis-f11-inbox-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const aegisDir = path.join(ws.dir, '.aegis');
  fs.mkdirSync(aegisDir, { recursive: true });
  const inboxPath = path.join(aegisDir, 'task-inbox.json');
  fs.writeFileSync(inboxPath, JSON.stringify([{ id: 10, issueNumber: 10, title: 'Seed', status: 'ready' }]), 'utf8');
  const env = { AEGIS_WORKSPACE: ws.dir, AEGIS_INBOX_PATH: inboxPath };
  const p1 = runAegisCli(['teamwork', 'plan', 'Harden auth module', 'src/a.ts', '--json'], { cwd: ws.dir, env });
  assert.equal(p1.status, 0, p1.stderr);
  const p2 = runAegisCli(['teamwork', 'plan', 'Add caching layer', 'src/b.ts', '--json'], { cwd: ws.dir, env });
  assert.equal(p2.status, 0, p2.stderr);
  const tasks = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
  const ids = tasks.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `Duplicate IDs after staging: ${JSON.stringify(ids)}`);
  assert.deepEqual(fs.readdirSync(aegisDir).filter((n) => n.includes('.tmp')), []);
}

async function testWorktreeManagerRemoveBounds(t) {
  const ws = createTempWorkspace('aegis-f11-wtrm-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const { WorktreeManager } = await import(ORCH_URL);
  const mgr = new WorktreeManager({ repoRoot: ws.dir, persistLocks: false });
  const wt = mgr.ensureWorktree('agent-one');
  assert.ok(fs.existsSync(wt.path));
  assert.throws(() => mgr.removeWorktree('..'), /Invalid agent name/i);
  assert.equal(fs.existsSync(ws.dir), true);
  assert.equal(mgr.removeWorktree('agent-one'), true);
  assert.equal(fs.existsSync(wt.path), false);
}

async function testOfflineTestHarnessSafeQuoting(t) {
  const base = createTempWorkspace('aegis-f11-off-');
  t.after(base.cleanup);
  const wsDir = path.join(base.dir, 'dir with space');
  fs.mkdirSync(wsDir, { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const marker = path.join(wsDir, 'injected-marker.txt');
  const runner = path.join(wsDir, process.platform === 'win32' ? 'echo-args.cmd' : 'echo-args.sh');
  const scriptBody = process.platform === 'win32'
    ? '@echo off\r\necho ARGS:%*\r\n'
    : '#!/bin/sh\necho "ARGS:$*"\n';
  fs.writeFileSync(runner, scriptBody, { mode: 0o755 });
  const { OfflineTestHarness } = await import(WD_URL);
  const harness = new OfflineTestHarness({ cwd: wsDir, timeoutMs: 5000 });
  const payloadArg = `ok&type nul>"${marker}"`;
  const res = await harness.run(runner, [payloadArg]);
  assert.equal(fs.existsSync(marker), false, 'Shell metacharacter in argument must not execute');
  assert.equal(res.passed, true, `OfflineTestHarness failed on spaced path: ${res.stderr}\n${res.stdout}`);
}

function testAstGrepBridgeNoShellInjection(t) {
  const ws = createTempWorkspace('aegis-f11-sg-');
  t.after(ws.cleanup);
  const binDir = path.join(ws.dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const sgPath = path.join(binDir, process.platform === 'win32' ? 'sg.cmd' : 'sg');
  fs.writeFileSync(sgPath, process.platform === 'win32' ? '@echo off\r\necho sg-ok\r\n' : '#!/bin/sh\necho sg-ok\n', { mode: 0o755 });
  const sep = process.platform === 'win32' ? '&' : ';';
  const code = `import { AstGrepBridge } from ${JSON.stringify(AST_URL)}; const out = AstGrepBridge.runCli(['--version', ${JSON.stringify(sep)}, 'echo', 'AEGIS_SHELL_INJECTED'], ${JSON.stringify(ws.dir)}); console.log(JSON.stringify({ out }));`;
  const runner = path.join(ws.dir, 'run-sg.mjs');
  fs.writeFileSync(runner, code, 'utf8');
  const res = runNode([runner], { cwd: ws.dir, env: { PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` } });
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout.trim());
  assert.ok(typeof parsed.out === 'string' && parsed.out.includes('sg-ok'), 'AstGrepBridge.runCli must execute dummy sg binary and return sg-ok');
  assert.equal(parsed.out.includes('AEGIS_SHELL_INJECTED'), false, 'AstGrepBridge.runCli must not interpret shell metacharacters');
}

function testAegisDebugSurfacesCorruptLockRecovery(t) {
  const ws = createTempWorkspace('aegis-f11-dbg-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  fs.mkdirSync(path.join(ws.dir, '.aegis'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, '.aegis', 'locks.json'), '{broken-json', 'utf8');
  const quiet = runAegisCli(['lock:status'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stderr.includes('WorktreeLockManager'), false);
  fs.writeFileSync(path.join(ws.dir, '.aegis', 'locks.json'), '{broken-json', 'utf8');
  const debug = runAegisCli(['lock:status'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir, AEGIS_DEBUG: '1' } });
  assert.equal(debug.status, 0, debug.stderr);
  assert.match(debug.stderr, /WorktreeLockManager:loadLocks/);
}

function holdLockWorker(workerScript, wsDir, agent, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerScript, agent, file], {
      env: buildCleanEnv({ AEGIS_WORKSPACE: wsDir }), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Worker ${agent} timeout`)); }, 8000);
    child.stdout.once('data', (chunk) => {
      clearTimeout(timer);
      const release = () => new Promise((r) => (child.exitCode !== null ? r() : (child.once('exit', r), child.stdin.end())));
      resolve({ status: chunk.toString('utf8').trim(), release });
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Worker ${agent} exited early: ${code}`)); });
  });
}

async function testConcurrentLockAndInboxIsolation(t) {
  const ws = createTempWorkspace('aegis-f11-conc-');
  t.after(ws.cleanup);
  const aegisDir = path.join(ws.dir, '.aegis');
  fs.mkdirSync(aegisDir, { recursive: true });
  const workerScript = path.join(ws.dir, 'lock-worker.mjs');
  fs.writeFileSync(workerScript, [
    `import { WorktreeLockManager } from ${JSON.stringify(ORCH_URL)};`,
    `const [agent, file] = process.argv.slice(2);`,
    `const res = new WorktreeLockManager({ repoRoot: ${JSON.stringify(ws.dir)}, persistLocks: true }).acquireFileLocks(agent, [file]);`,
    `console.log(res.success ? 'OK' : 'CONFLICT');`,
    `if (!res.success) process.exit(2);`,
    `process.stdin.on('end', () => process.exit(0)); process.stdin.resume();`
  ].join('\n'), 'utf8');
  const settled = await Promise.allSettled([holdLockWorker(workerScript, ws.dir, 'a1', 'src/f1.ts'), holdLockWorker(workerScript, ws.dir, 'a2', 'src/f2.ts')]);
  try {
    const [w1, w2] = settled.map((r) => { if (r.status === 'rejected') throw r.reason; return r.value; });
    assert.equal(w1.status, 'OK');
    assert.equal(w2.status, 'OK');
    const locks = JSON.parse(fs.readFileSync(path.join(aegisDir, 'locks.json'), 'utf8'));
    assert.equal(locks['src/f1.ts'], 'a1');
    assert.equal(locks['src/f2.ts'], 'a2');
    assert.equal(runNode([workerScript, 'a3', 'src/f1.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } }).status, 2);
  } finally {
    await Promise.all(settled.filter((r) => r.status === 'fulfilled').map((r) => r.value.release()));
  }
}

function registerTier1() {
  test('T1.1 WorktreeLockManager.withLock preserves re-entrant outer lockDir', testWorktreeLockManagerReentrancy);
  test('T1.2 WorktreeManager.validateAgentName blocks traversal and invalid names', testWorktreeManagerValidateAgentName);
  test('T1.3 ProjectBootstrapEngine validates branches and scaffolds repo cleanly', testBootstrapBranchValidationAndScaffold);
  test('T1.4 node:sqlite missing built-in returns [] and logs under AEGIS_DEBUG=1', testNodeSqliteFallbackAndDebugLog);
  test('T1.5 production TS has 0 shell: true literals and 0 zero-statement catches', testZeroEmptyCatchesAndShellTrueInPackages);
  test('T1.6 turbo.json typecheck outputs align with workspace tsc --noEmit', testTurboAndWorkspaceTypecheckAlignment);
  test('T1.7 repo .aegis/task-inbox.json has unique IDs and zero .tmp files', testRepoTaskInboxHygiene);
}

function registerTier2() {
  test('T2.1 CLI teamwork plan deduplicates inbox IDs and cleans .tmp files', testCliTeamworkPlanDeduplicatesInboxAndCleansTmp);
  test('T2.2 WorktreeManager.removeWorktree refuses traversal and deletes valid worktree', testWorktreeManagerRemoveBounds);
  test('T2.3 OfflineTestHarness handles spaces and metacharacters safely', testOfflineTestHarnessSafeQuoting);
  test('T2.4 AstGrepBridge.runCli does not execute shell metacharacters', testAstGrepBridgeNoShellInjection);
  test('T2.5 AEGIS_DEBUG=1 logs corrupt lock recovery on stderr', testAegisDebugSurfacesCorruptLockRecovery);
  test('T2.6 Concurrent child processes acquire disjoint locks without mutex corruption', testConcurrentLockAndInboxIsolation);
}

describe('Tier 1: F11 Concurrency, Hygiene, Shell & Node Compat Contracts', registerTier1);
describe('Tier 2: F11 Subprocess Concurrency, Quoting & Bootstrap Integration', registerTier2);
