import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as vm from 'node:vm';
import {
  REPO_ROOT,
  createTempWorkspace,
  hasUtf8Bom,
  runAegisCli,
  runNpm
} from './helpers/cli-runner.mjs';
import { countLines } from './helpers/gate-helpers.mjs';
import { getFreePort, httpRequest, wsHandshakeProbe } from './helpers/net-helpers.mjs';
import { safeParseJson } from '../../packages/shared/dist/index.js';
import { MCPSecurityManager } from '../../packages/core/mcp-security/dist/index.js';
import {
  AmbientCookieVaultExtractor,
  HttpRotateEngine,
  NotebookLmNativeClient,
  fetchPostWithTimeout
} from '../../packages/core/github-live/dist/index.js';
import {
  ProjectBootstrapEngine,
  UniversalToolchainSync,
  WorktreeLockManager,
  WorktreeManager,
  validateGitBranchName
} from '../../packages/core/orchestrator/dist/index.js';
import { DashboardServer } from '../../packages/web-dashboard/dist/index.js';
import { WsBridgeServer } from '../../packages/plugins/godot-bridge/dist/index.js';
import { OfflineTestHarness } from '../../packages/core/watchdog/dist/index.js';
import { CompoundingErrorChecker } from '../../packages/core/compound-checker/dist/index.js';

function createMockDom() {
  const els = new Map();
  const getEl = (key) => {
    if (!els.has(key)) els.set(key, { innerHTML: '', innerText: '', style: {}, classList: { add() {}, remove() {} }, value: '' });
    return els.get(key);
  };
  return {
    els,
    window: {},
    document: { getElementById: getEl, querySelector: getEl },
    EventSource: function MockEs() { this.addEventListener = () => {}; },
    fetch: async () => ({ json: async () => ({}) })
  };
}

function startMockHttp(t) {
  const srv = http.createServer((req, res) => {
    if (req.url === '/rotate') {
      res.writeHead(200, { 'Set-Cookie': ['__Secure-1PSIDTS=rot_1; Path=/', 'NID=abc_2; HttpOnly'] });
      res.end('ok');
    } else if (req.url === '/slow') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      setTimeout(() => { if (!res.writableEnded) res.end('late'); }, 1500).unref();
    } else {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('unauthorized');
    }
  });
  t.after(() => new Promise((r) => {
    srv.closeAllConnections?.();
    srv.close(() => r());
  }));
  return getFreePort().then((port) => new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve(port))));
}

function testP1McpConfigPortabilityBomToolchainSync(t) {
  for (const rel of ['.vscode/mcp.json', '.cursor/mcp.example.json', 'plugins/aegis-copilot/mcp.json']) {
    const abs = path.join(REPO_ROOT, rel);
    assert.equal(hasUtf8Bom(abs), false, `${rel} must not contain BOM`);
    const text = fs.readFileSync(abs, 'utf8');
    JSON.parse(text);
    assert.equal(/C:\\Users\\Lenovo|C:\\Program Files|notebooklm\/dist|godot-mcp\.js/i.test(text), false, `${rel} has broken/hardcoded path`);
  }
  const compSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/cli/src/commands/completion-command.ts'), 'utf8');
  const ideSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/cli/src/commands/ide-commands.ts'), 'utf8');
  assert.equal(/C:\\Users\\Lenovo/.test(compSrc), false, 'completion-command.ts must not hardcode user path');
  assert.equal(/notebooklm\/dist|godot-mcp\.js/.test(ideSrc), false, 'ide-commands.ts must not reference missing plugin bins');
  const ws = createTempWorkspace('aegis-t3s-p1-');
  t.after(ws.cleanup);
  fs.mkdirSync(path.join(ws.dir, '.cursor'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, '.cursor/mcp.json'), `\uFEFF${JSON.stringify({ mcpServers: { custom: { command: 'node', args: ['a.js'] } } })}`, 'utf8');
  const sync = new UniversalToolchainSync(ws.dir);
  const found = sync.discoverMcpServers();
  assert.ok(found.some((s) => s.name === 'custom'), 'ToolchainSync must parse BOM-prefixed .cursor/mcp.json');
}

function testP2RbacToolAndContainmentWithCageCheck(t) {
  const ws = createTempWorkspace('aegis-t3s-p2-');
  t.after(ws.cleanup);
  const wt = path.join(ws.dir, 'wt');
  const wtEvil = path.join(ws.dir, 'wt-evil');
  const outside = path.join(ws.dir, 'outside');
  fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
  fs.mkdirSync(wtEvil, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, path.join(wt, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');
  const sec = new MCPSecurityManager();
  assert.equal(sec.authorizeToolCall('issue-solver', 'write_file').allowed, true);
  assert.equal(sec.authorizeToolCall('issue-solver', 'force_push').allowed, false);
  assert.equal(sec.authorizeToolCall('qa-hunter', 'write_file').allowed, false);
  assert.equal(sec.authorizeToolCall('rogue-agent', 'read_file').allowed, false);
  assert.equal(sec.authorizeFileOperation('issue-solver', 'src/ok.ts', wt).allowed, true);
  assert.equal(sec.authorizeFileOperation('issue-solver', '../outside/x.ts', wt).allowed, false);
  assert.equal(sec.authorizeFileOperation('issue-solver', '../wt-evil/secret.ts', wt).allowed, false);
  assert.equal(sec.authorizeFileOperation('issue-solver', 'a\0b.ts', wt).allowed, false);
  assert.equal(sec.authorizeFileOperation('issue-solver', 'D:\\evil.ts', wt).allowed, false);
  assert.equal(sec.authorizeFileOperation('issue-solver', 'link-out/secret.ts', wt).allowed, false);
  const cage = runAegisCli(['cage:check', 'packages/core/mcp-security/src', '--no-cache', '--json'], { cwd: REPO_ROOT });
  assert.equal(cage.status, 0);
  assert.equal(JSON.parse(cage.stdout).clean, true);
}

async function testP3HttpMultiCookieTimeoutWikiAndBomRpc(t) {
  const ws = createTempWorkspace('aegis-t3s-p3-');
  t.after(ws.cleanup);
  const port = await startMockHttp(t);
  const rotRes = await HttpRotateEngine.rotate('SID=s1; OSID=o1', {
    saveOnSuccess: false,
    httpPost: (_u, _b, o) => fetchPostWithTimeout(`http://127.0.0.1:${port}/rotate`, '{}', o, 2000)
  });
  assert.equal(rotRes.success, true);
  assert.ok(rotRes.refreshedCookies?.includes('__Secure-1PSIDTS=rot_1') && rotRes.refreshedCookies?.includes('NID=abc_2'));
  await assert.rejects(() => fetchPostWithTimeout(`http://127.0.0.1:${port}/slow`, '{}', { timeoutMs: 150 }, 150));
  const client = new NotebookLmNativeClient({
    cookies: 'SID=s1',
    httpPost: (_u, _b, o) => fetchPostWithTimeout(`http://127.0.0.1:${port}/auth-fail`, '{}', o, 2000)
  });
  await assert.rejects(() => client.listNotebooks(), /401/);
  assert.deepEqual(safeParseJson('\uFEFF{"rpc":"ok"}'), { rpc: 'ok' });
  const wikiCfg = path.join(REPO_ROOT, '.aegis/wiki-cache/.git/config');
  if (fs.existsSync(wikiCfg)) {
    const raw = fs.readFileSync(wikiCfg, 'utf8');
    assert.equal(/x-access-token:|ghp_/i.test(raw), false, 'wiki-cache git config must not store plaintext token');
  }
  const rows = AmbientCookieVaultExtractor.querySqliteDatabase(path.join(ws.dir, 'c.db'), () => {
    throw Object.assign(new Error('No node:sqlite'), { code: 'ERR_UNKNOWN_BUILTIN_MODULE' });
  });
  assert.deepEqual(rows, []);
}

async function testP4DashboardWsOriginXssAndRepoRootIsolation(t) {
  const ws = createTempWorkspace('aegis-t3s-p4-');
  let dash = null;
  let wsBridge = null;
  t.after(async () => {
    await Promise.allSettled([dash?.stop(), wsBridge?.stop()]);
    http.globalAgent.destroy();
    ws.cleanup();
  });
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/bad.ts'), 'export const x: any = 1;\n', 'utf8');
  dash = new DashboardServer({ port: 0, repoRoot: ws.dir, offline: true });
  wsBridge = new WsBridgeServer({ port: 0 });
  const [dashPort, wsPort] = await Promise.all([dash.start(), wsBridge.start()]);
  const okOrigin = await httpRequest(`http://127.0.0.1:${dashPort}/api/status`, { headers: { Origin: `http://127.0.0.1:${dashPort}` } });
  assert.equal(okOrigin.status, 200);
  const noPortOrigin = await httpRequest(`http://127.0.0.1:${dashPort}/api/status`, { headers: { Origin: 'http://localhost' } });
  assert.equal(noPortOrigin.status, 403, 'Portless Origin must be rejected with 403 (ISS-18)');
  assert.equal((await httpRequest(`http://127.0.0.1:${dashPort}/api/status`, { headers: { Origin: 'http://evil.com' } })).status, 403);
  const html = (await httpRequest(`http://127.0.0.1:${dashPort}/`)).body;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const dom = createMockDom();
  vm.runInNewContext(script, dom);
  dom.updateState({ issues: [{ number: 1, status: 'ready', title: '<img src=x onerror=alert(1)>', targetFiles: [] }], agents: [] });
  assert.equal(dom.els.get('#col-ready .cards-list').innerHTML.includes('<img'), false, 'Kanban innerHTML must escape XSS');
  const toolRes = await httpRequest(`http://127.0.0.1:${dashPort}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${dashPort}` },
    body: JSON.stringify({ action: 'run_engine_tool', tool: 'cage_check', dir: 'src' })
  });
  const toolJson = JSON.parse(toolRes.body);
  assert.ok(toolJson.result.violationsCount >= 1);
  assert.equal(toolJson.result.violations[0].file.startsWith('..'), false, 'cage_check must use repoRoot, not process.cwd()');
  const tok = wsBridge.getSessionToken();
  assert.equal((await wsHandshakeProbe(wsPort, `/?token=${tok}`, 'null')).statusCode, 403);
  assert.equal((await wsHandshakeProbe(wsPort, `/?token=${tok}`, 'http://localhost.evil.com')).statusCode, 403);
  assert.equal((await wsHandshakeProbe(wsPort, '/?token=bad', `http://127.0.0.1:${wsPort}`)).statusCode, 401);
  assert.equal((await wsHandshakeProbe(wsPort, `/?token=${tok}`, `http://127.0.0.1:${wsPort}`)).statusCode, 101);
}

async function testP5LockReentrancyBomRecoveryBootstrapAndOfflineArgs(t) {
  const ws = createTempWorkspace('aegis-t3s-p5-');
  t.after(ws.cleanup);
  const boot = ProjectBootstrapEngine.bootstrap(ws.dir, { projectName: 'p5-boot' });
  assert.equal(boot.initializedGit, true);
  assert.ok(fs.existsSync(path.join(ws.dir, '.aegis/task-inbox.json')));
  assert.throws(() => validateGitBranchName('; rm -rf /'));
  assert.throws(() => new WorktreeManager({ repoRoot: ws.dir }).removeWorktree('../escape'));
  fs.writeFileSync(path.join(ws.dir, '.aegis/locks.json'), `\uFEFF${JSON.stringify({ 'a.ts': 'agent-a' })}`, 'utf8');
  const lockMgr = new WorktreeLockManager({ repoRoot: ws.dir, persistLocks: true });
  assert.equal(lockMgr.getLockedFiles().get('a.ts'), 'agent-a');
  lockMgr.withLock(() => {
    assert.equal(lockMgr.acquireFileLocks('agent-b', ['b.ts']).success, true);
    assert.ok(fs.existsSync(`${lockMgr.getLockFilePath()}.lock`), 'Nested withLock must keep outer .lock');
  });
  const inbox = safeParseJson(fs.readFileSync(path.join(REPO_ROOT, '.aegis/task-inbox.json'), 'utf8'));
  const ids = inbox.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'REPO_ROOT task-inbox.json must have 0 duplicate IDs');
  assert.equal(fs.readdirSync(path.join(REPO_ROOT, '.aegis')).some((f) => f.includes('.tmp')), false);
  fs.writeFileSync(path.join(ws.dir, 'package.json'), JSON.stringify({ name: 'p5-off', scripts: { test: 'node check.cjs' } }));
  fs.writeFileSync(path.join(ws.dir, 'check.cjs'), "if (!process.argv.slice(2).includes('space target.test.mjs')) process.exit(1);\n", 'utf8');
  const offRes = await new OfflineTestHarness({ cwd: ws.dir, target: 'space target.test.mjs' }).run();
  assert.equal(offRes.passed, true, 'OfflineTestHarness must preserve args with spaces on Windows');
}

function testP6BudgetRefactorsCompoundCheckerAndSharedGuards(t) {
  for (const rel of [
    'packages/core/orchestrator/src/teamwork-coordinator.ts',
    'packages/cli/src/commands/teamwork-command.ts',
    'packages/cli/src/commands/rfc-pipeline-command.ts'
  ]) {
    const abs = path.join(REPO_ROOT, rel);
    assert.equal(hasUtf8Bom(abs), false, `${rel} must not contain BOM`);
    assert.ok(countLines(abs) < 270, `${rel} must be refactored below 270 lines (actual: ${countLines(abs)})`);
  }
  const checker = new CompoundingErrorChecker();
  const base = { changedFilesCount: 1, diffLinesCount: 5, failingTestsCount: 1, failingTestNames: ['t1'], timestamp: 't' };
  assert.equal(checker.recordStep({ ...base, step: 1 }), null);
  assert.equal(checker.recordStep({ ...base, step: 2 }), null);
  const alert = checker.recordStep({ ...base, step: 3 });
  assert.equal(alert?.alert, 'COMPOUNDING_LOOP');
  const ccTest = runNpm(['test', '--workspace=@aegis/compound-checker'], { cwd: REPO_ROOT, timeoutMs: 30000 });
  assert.equal(ccTest.status, 0, ccTest.stderr);
  assert.match(ccTest.stdout, /pass\s+8/);
}

describe('Tier 3: Cross-Feature Security & Runtime (F07-F12 x F01-F06)', () => {
  test('P1 (F07xF02xF01): MCP config portability + BOM-safe toolchain sync', testP1McpConfigPortabilityBomToolchainSync);
  test('P2 (F08xF06xF01): RBAC tool/file containment + cage:check compliance', testP2RbacToolAndContainmentWithCageCheck);
  test('P3 (F09xF02xF03): HTTP multi-Set-Cookie + timeout + wiki token + BOM RPC', testP3HttpMultiCookieTimeoutWikiAndBomRpc);
  test('P4 (F10xF05xF06): Dashboard & WS origin/XSS + repoRoot isolation', testP4DashboardWsOriginXssAndRepoRootIsolation);
  test('P5 (F11xF02xF06): Lock re-entrancy + BOM recovery + bootstrap + offline args', testP5LockReentrancyBomRecoveryBootstrapAndOfflineArgs);
  test('P6 (F12xF03xF06): Budget refactors + compound-checker + shared test guards', testP6BudgetRefactorsCompoundCheckerAndSharedGuards);
});
