import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as vm from 'node:vm';
import {
  REPO_ROOT,
  CLI_BIN,
  createTempWorkspace,
  hasUtf8Bom,
  initTempGitRepo,
  readPackageJson,
  runAegisCli,
  runExec,
  runGit,
  runNode,
  runNpm
} from './helpers/cli-runner.mjs';
import { spawnDashboardServer, writeTempModuleWithTest } from './helpers/gate-helpers.mjs';
import { httpRequest, wsHandshakeProbe } from './helpers/net-helpers.mjs';
import { ProjectBootstrapEngine, WorktreeLockManager } from '../../packages/core/orchestrator/dist/index.js';
import { MCPSecurityManager } from '../../packages/core/mcp-security/dist/index.js';
import { WsBridgeServer } from '../../packages/plugins/godot-bridge/dist/index.js';

function linkTs(dir) {
  const nm = path.join(dir, 'node_modules');
  fs.mkdirSync(nm, { recursive: true });
  fs.symlinkSync(
    path.join(REPO_ROOT, 'node_modules', 'typescript'),
    path.join(nm, 'typescript'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
}

function setupS1Repo(wsDir) {
  const cliTarget = path.join(wsDir, 'packages/cli/dist/bin/aegis.js');
  fs.mkdirSync(path.dirname(cliTarget), { recursive: true });
  fs.copyFileSync(CLI_BIN, cliTarget);
  linkTs(wsDir);
  fs.writeFileSync(path.join(wsDir, 'package.json'), JSON.stringify({
    name: 's1-lifecycle',
    private: true,
    type: 'module',
    scripts: { build: 'node -e "process.exit(0)"', typecheck: 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"', test: 'node --test packages/app/src/calc.test.ts' }
  }));
  fs.mkdirSync(path.join(wsDir, 'packages/app'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'packages/app/package.json'), JSON.stringify({ name: '@s1/app', version: '1.0.0', type: 'module' }));
  const src = 'export function add(a: number, b: number): number { return a + b; }\nexport function isPos(n: number): boolean { return n > 0; }\n';
  const tst = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, isPos } from './calc.ts';\ntest('calc', () => { assert.equal(add(1, 2), 3); assert.equal(isPos(1), true); assert.equal(isPos(0), false); });\n";
  writeTempModuleWithTest(wsDir, 'packages/app/src/calc.ts', src, 'packages/app/src/calc.test.ts', tst);
  writeTempModuleWithTest(wsDir, 'packages/app/dist/calc.js', 'export function add(a, b) { return a + b; }\nexport function isPos(n) { return n > 0; }\n', 'packages/app/dist/calc.test.js', tst.replace('./calc.ts', './calc.js'));
  fs.writeFileSync(path.join(wsDir, 'layout.json'), JSON.stringify([{ id: 'btn', x: 0, y: 0, width: 100, height: 50 }]));
  fs.writeFileSync(path.join(wsDir, 'aegis.config.json'), JSON.stringify({ godot: { aspectRatios: ['16:9'] } }));
  fs.writeFileSync(path.join(wsDir, '.aegis/ui_telemetry.json'), JSON.stringify({
    nodes: [{ id: 'btn', type: 'Button', visible: true, rect: { x: 0, y: 0, width: 100, height: 50 } }]
  }));
}

function testS1CleanTempRepoLifecycle(t) {
  const ws = createTempWorkspace('aegis-t4-s1-');
  t.after(ws.cleanup);
  const boot = ProjectBootstrapEngine.bootstrap(ws.dir, { projectName: 's1-lifecycle' });
  assert.ok(boot.initializedGit && boot.createdGitignore && boot.createdReadme && boot.createdDocs && boot.createdAegis);
  setupS1Repo(ws.dir);
  runGit(['config', 'user.email', 's1@aegis.local'], ws.dir);
  runGit(['config', 'user.name', 'S1'], ws.dir);
  runGit(['add', '.'], ws.dir);
  assert.equal(runGit(['commit', '-m', 'init'], ws.dir).status, 0);
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir }, timeoutMs: 45000 };
  assert.equal(runAegisCli(['init'], opts).status, 0);
  const cage = runAegisCli(['cage:check', 'packages/app/src', '--no-cache', '--json'], opts);
  assert.equal(cage.status, 0);
  assert.equal(JSON.parse(cage.stdout).clean, true);
  const mut = runAegisCli(['mutate', 'packages/app/src/calc.ts'], opts);
  assert.equal(mut.status, 0, mut.stderr);
  assert.match(mut.stdout, /PASSED/i);
  assert.equal(runAegisCli(['inspect', 'layout.json'], opts).status, 0);
  assert.equal(runAegisCli(['godot', 'inspect', ws.dir], opts).status, 0);
  const audit = runAegisCli(['ci:audit', '--fast', '--json'], opts);
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  const auditJson = JSON.parse(audit.stdout);
  assert.equal(auditJson.success, true);
  assert.equal(auditJson.failedCount, 0);
}

function testS2IsolatedPackedBundleWithoutDevDeps(t) {
  const ws = createTempWorkspace('aegis-t4-s2-');
  t.after(ws.cleanup);
  const pack = runNpm(['pack', '--workspace=@aegis/cli', '--pack-destination', ws.dir, '--json'], { cwd: REPO_ROOT, timeoutMs: 45000 });
  assert.equal(pack.status, 0, pack.stderr);
  const tgz = path.join(ws.dir, JSON.parse(pack.stdout)[0].filename);
  const unpackDir = path.join(ws.dir, 'unpacked');
  fs.mkdirSync(unpackDir, { recursive: true });
  assert.equal(runExec('tar', ['-xzf', tgz, '-C', unpackDir], { cwd: ws.dir }).status, 0);
  const pkgDir = path.join(unpackDir, 'package');
  const manifest = readPackageJson(path.join(pkgDir, 'package.json'));
  assert.equal(typeof manifest.dependencies?.typescript, 'string');
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}).filter((k) => k.startsWith('@aegis/')), []);
  linkTs(pkgDir);
  assert.equal(fs.existsSync(path.join(pkgDir, 'node_modules/@aegis')), false);
  const projDir = path.join(ws.dir, 'proj');
  fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });
  initTempGitRepo(projDir);
  fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({ name: 's2-proj', version: '1.0.0' }));
  fs.writeFileSync(path.join(projDir, 'package-lock.json'), JSON.stringify({ name: 's2-proj', lockfileVersion: 3 }));
  fs.writeFileSync(path.join(projDir, 'src/clean.ts'), 'export const ok: number = 1;\n', 'utf8');
  const bin = path.join(pkgDir, 'dist/bin/aegis.js');
  const opts = { cwd: projDir, env: { AEGIS_WORKSPACE: projDir } };
  assert.equal(runNode([bin, '--version'], opts).status, 0);
  assert.equal(runNode([bin, 'status'], opts).status, 0);
  assert.equal(JSON.parse(runNode([bin, 'cage:check', 'src', '--no-cache', '--json'], opts).stdout).clean, true);
  assert.equal(runNode([bin, 'deps:sync'], opts).status, 0);
  assert.equal(runNode([bin, 'deps:drift', '--strict'], opts).status, 0);
}

async function cleanupS3(ws, dash, wsBridge) {
  http.globalAgent.destroy();
  await Promise.allSettled([dash?.stop(), wsBridge?.stop()]);
  dash?.child?.stdout?.destroy();
  dash?.child?.stderr?.destroy();
  for (let i = 0; i < 4; i++) {
    try { ws.cleanup(); return; } catch { await new Promise((r) => setTimeout(r, 50)); }
  }
}

async function verifyS3XssAndWs(dash, wsBridge, wsPort) {
  const statusJson = JSON.parse((await httpRequest(`${dash.url}/api/status`)).body);
  const html = (await httpRequest(`${dash.url}/`)).body;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const els = new Map();
  const getEl = (k) => (els.has(k) ? els.get(k) : els.set(k, { innerHTML: '', innerText: '', style: {} }).get(k));
  const ctx = { window: {}, document: { getElementById: getEl, querySelector: getEl }, EventSource: function () { this.addEventListener = () => {}; } };
  vm.runInNewContext(script, ctx);
  ctx.updateState(statusJson);
  ctx.appendLog('<svg onload=alert(1)>');
  assert.equal(els.get('#col-ready .cards-list').innerHTML.includes('<img'), false, 'Dashboard HTML must escape XSS in task titles');
  assert.equal(els.get('log-box').innerHTML.includes('<svg'), false, 'Dashboard log must escape XSS');
  const tok = wsBridge.getSessionToken();
  assert.equal((await wsHandshakeProbe(wsPort, `/?token=${tok}`, 'null')).statusCode, 403);
  assert.equal((await wsHandshakeProbe(wsPort, `/?token=${tok}`, 'http://localhost.evil.com')).statusCode, 403);
  assert.equal((await wsHandshakeProbe(wsPort, '/?token=wrong', `http://127.0.0.1:${wsPort}`)).statusCode, 401);
  assert.equal((await wsHandshakeProbe(wsPort, `/?token=${tok}`, `http://127.0.0.1:${wsPort}`)).statusCode, 101);
}

async function testS3LiveDashboardHttpAndWsSecurityWorkflow(t) {
  const ws = createTempWorkspace('aegis-t4-s3-');
  let dash = null;
  let wsBridge = null;
  t.after(() => cleanupS3(ws, dash, wsBridge));
  initTempGitRepo(ws.dir);
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/bad.ts'), 'export const x: any = 1;\n', 'utf8');
  dash = await spawnDashboardServer(0, ws.dir);
  wsBridge = new WsBridgeServer({ port: 0 });
  const wsPort = await wsBridge.start();
  assert.equal((await httpRequest(`${dash.url}/api/status`, { headers: { Origin: `http://127.0.0.1:${dash.port}` } })).status, 200);
  assert.equal((await httpRequest(`${dash.url}/api/status`, { headers: { Origin: 'http://localhost' } })).status, 403);
  assert.equal((await httpRequest(`${dash.url}/api/action`, { method: 'POST', headers: { Origin: 'http://evil.example' }, body: '{}' })).status, 403);
  await httpRequest(`${dash.url}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${dash.port}` },
    body: JSON.stringify({ action: 'create_task', title: '<img src=x onerror=alert(1)>', targetFiles: ['src/<script>bad.ts'] })
  });
  await verifyS3XssAndWs(dash, wsBridge, wsPort);
}

function testS4BomContaminatedWorkspaceStrictCliResilience(t) {
  const ws = createTempWorkspace('aegis-t4-s4-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  fs.mkdirSync(path.join(ws.dir, '.aegis'), { recursive: true });
  const writeBom = (rel, obj) => fs.writeFileSync(path.join(ws.dir, rel), `\uFEFF${JSON.stringify(obj)}`, 'utf8');
  writeBom('package.json', { name: 's4-bom', version: '1.0.0' });
  writeBom('package-lock.json', { name: 's4-bom', lockfileVersion: 3 });
  writeBom('turbo.json', { tasks: {} });
  writeBom('.aegis/task-inbox.json', [{ issueNumber: 91, title: 'BOM Task Alpha', role: 'issue-solver', status: 'pending', targetFiles: ['src/a.ts'] }]);
  writeBom('.aegis/locks.json', { 'src/a.ts': 'issue-solver' });
  writeBom('aegis.config.json', { godot: { aspectRatios: ['16:9'] } });
  writeBom('.aegis/ui_telemetry.json', { nodes: [{ id: 'ok', type: 'Button', visible: true, rect: { x: 0, y: 0, width: 80, height: 48 } }] });
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir, AEGIS_INBOX_PATH: path.join(ws.dir, '.aegis/task-inbox.json') } };
  const list = runAegisCli(['task:list'], opts);
  assert.equal(list.status, 0);
  assert.match(list.stdout, /BOM Task Alpha/);
  assert.equal(runAegisCli(['lock:status'], opts).status, 0);
  assert.equal(fs.readdirSync(path.join(ws.dir, '.aegis')).some((f) => f.includes('.corrupt.')), false);
  assert.equal(runAegisCli(['deps:drift', '--strict'], opts).status, 1);
  assert.equal(runAegisCli(['deps:sync'], opts).status, 0);
  assert.equal(runAegisCli(['deps:drift', '--strict'], opts).status, 0);
  assert.equal(runAegisCli(['godot', 'inspect', ws.dir], opts).status, 0);
  fs.writeFileSync(path.join(ws.dir, 'bad.json'), '\uFEFF{"broken":', 'utf8');
  assert.notEqual(runAegisCli(['inspect', path.join(ws.dir, 'bad.json')], opts).status, 0);
}

function testS5ConcurrentLockInboxStagingAndRbacWorkflow(t) {
  const ws = createTempWorkspace('aegis-t4-s5-');
  const wsSibling = `${ws.dir}-evil`;
  fs.mkdirSync(wsSibling, { recursive: true });
  t.after(() => { ws.cleanup(); fs.rmSync(wsSibling, { recursive: true, force: true }); });
  initTempGitRepo(ws.dir);
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(ws.dir, 'ui'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/auth.ts'), 'export const auth: boolean = true;\n', 'utf8');
  fs.writeFileSync(path.join(ws.dir, 'ui/panel.tscn'), '[gd_scene format=3]\n', 'utf8');
  const opts = { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir, AEGIS_INBOX_PATH: path.join(ws.dir, '.aegis/task-inbox.json') } };
  const plan = runAegisCli(['teamwork:plan', 'Implement auth module and panel UI', 'src/auth.ts', 'ui/panel.tscn', '--json'], opts);
  assert.equal(plan.status, 0, plan.stderr);
  const inbox = JSON.parse(fs.readFileSync(path.join(ws.dir, '.aegis/task-inbox.json'), 'utf8'));
  assert.ok(inbox.length >= 1);
  assert.equal(new Set(inbox.map((i) => i.id)).size, inbox.length);
  assert.equal(runAegisCli(['lock:status'], opts).status, 0);
  const lockMgr = new WorktreeLockManager({ repoRoot: ws.dir, persistLocks: true });
  assert.equal(lockMgr.acquireFileLocks('issue-solver', ['src/auth.ts']).success, true);
  const lockMgrOther = new WorktreeLockManager({ repoRoot: ws.dir, persistLocks: true });
  assert.equal(lockMgrOther.acquireFileLocks('other-agent', ['src/auth.ts']).success, false, 'Conflicting agent lock must be denied');
  assert.equal(runAegisCli(['task:pull', 'issue-solver'], opts).status, 0);
  const sec = new MCPSecurityManager();
  assert.equal(sec.authorizeToolCall('issue-solver', 'write_file').allowed, true);
  assert.equal(sec.authorizeToolCall('issue-solver', 'force_push').allowed, false);
  assert.equal(sec.authorizeFileOperation('issue-solver', 'src/auth.ts', ws.dir).allowed, true);
  assert.equal(sec.authorizeFileOperation('issue-solver', `../${path.basename(wsSibling)}/hack.ts`, ws.dir).allowed, false);
  assert.equal(runAegisCli(['task:release', 'issue-solver', 'done'], opts).status, 0);
  lockMgr.releaseFileLocks('issue-solver');
  const lockMgrAfter = new WorktreeLockManager({ repoRoot: ws.dir, persistLocks: true });
  assert.equal(lockMgrAfter.acquireFileLocks('other-agent', ['src/auth.ts']).success, true);
}

function testS6BaselineWorkspaceWorktreesAndCompoundCheckerPreservation(t) {
  const wtRes = runGit(['worktree', 'list', '--porcelain'], REPO_ROOT);
  assert.equal(wtRes.status, 0);
  const wtPaths = wtRes.stdout.split(/\r?\n/).filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
  assert.ok(wtPaths.length >= 15, `Expected >= 15 preserved worktrees, got ${wtPaths.length}`);
  for (const exp of ['experimental/contributor', 'experimental/docs', 'experimental/qa', 'experimental/solver']) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, exp)), `Missing worktree dir: ${exp}`);
  }
  for (const rel of [
    'b', 'docs/codex-live-validation.md', 'docs/codex-release-validation.md',
    'packages/cli/src/commands/godot-command.ts', 'packages/cli/src/commands/nlm-command.ts',
    'packages/plugins/godot-bridge/src/rpc/ws-bridge-server.ts',
    'packages/plugins/godot-bridge/src/godot-live-contract.test.ts',
    'packages/plugins/godot-bridge/gdscript/addons/aegis_bridge/aegis_client.gd',
    'packages/plugins/godot-bridge/gdscript/addons/aegis_bridge/ui_verifier.gd'
  ]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `Preserved file missing: ${rel}`);
  }
  const ccPkg = readPackageJson('packages/core/compound-checker/package.json');
  assert.ok(ccPkg.exports && ccPkg.scripts?.test?.includes('!f.length'));
  assert.equal(hasUtf8Bom(path.join(REPO_ROOT, 'packages/core/compound-checker/package.json')), false);
  const ccTest = runNpm(['test', '--workspace=@aegis/compound-checker'], { cwd: REPO_ROOT, timeoutMs: 30000 });
  assert.equal(ccTest.status, 0, ccTest.stderr);
  assert.match(ccTest.stdout, /pass\s+8/);
  const sharedTest = runNpm(['test', '--workspace=@aegis/shared'], { cwd: REPO_ROOT, timeoutMs: 30000 });
  assert.equal(sharedTest.status, 0, sharedTest.stderr);
  assert.match(sharedTest.stdout, /pass\s+[1-9]\d*/);
  const ccCage = runAegisCli(['cage:check', 'packages/core/compound-checker/src', '--no-cache', '--json'], { cwd: REPO_ROOT });
  assert.equal(ccCage.status, 0);
  assert.equal(JSON.parse(ccCage.stdout).clean, true);
}

describe('Tier 4: Real-World End-to-End Workflows (S1-S6)', () => {
  test('S1: Clean temp repo lifecycle (Bootstrap -> cage:check -> mutate -> inspect -> ci:audit)', testS1CleanTempRepoLifecycle);
  test('S2: Isolated CLI bundle execution without devDependencies (npm pack smoke)', testS2IsolatedPackedBundleWithoutDevDeps);
  test('S3: Live Dashboard HTTP + WS Bridge origin/XSS security workflow', testS3LiveDashboardHttpAndWsSecurityWorkflow);
  test('S4: BOM-contaminated workspace configs & CLI strict exit-code resilience', testS4BomContaminatedWorkspaceStrictCliResilience);
  test('S5: Concurrent worktree lock + task inbox staging + RBAC guard workflow', testS5ConcurrentLockInboxStagingAndRbacWorkflow);
  test('S6: Baseline workspace, 15 worktrees & @aegis/compound-checker preservation', testS6BaselineWorkspaceWorktreesAndCompoundCheckerPreservation);
});
