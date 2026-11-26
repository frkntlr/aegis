import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, createTempWorkspace } from './helpers/cli-runner.mjs';
import { getFreePort, httpRequest, wsHandshakeProbe } from './helpers/net-helpers.mjs';
import { spawnDashboardServer } from './helpers/gate-helpers.mjs';

const DASHBOARD_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/web-dashboard/dist/index.js')
).href;
const ANALYSIS_TOOLS_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/web-dashboard/dist/server/engine-analysis-tools.js')
).href;
const BRIDGE_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/plugins/godot-bridge/dist/index.js')
).href;

function createMockElement(id) {
  const el = {
    id,
    _html: '',
    _text: '',
    style: {},
    classList: { add() {}, remove() {} },
    children: [],
    appendChild(child) { this.children.push(child); },
    get innerHTML() { return this._html; },
    set innerHTML(val) { this._html = String(val); },
    get textContent() { return this._text; },
    set textContent(val) {
      this._text = String(val);
      this._html = this._text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    get innerText() { return this.textContent; },
    set innerText(val) { this.textContent = val; }
  };
  return el;
}

function makeDomSandbox() {
  const map = new Map();
  const getEl = (id) => {
    if (!map.has(id)) map.set(id, createMockElement(id));
    return map.get(id);
  };
  const doc = {
    getElementById: getEl,
    querySelector: (sel) => getEl(sel),
    createElement: (tag) => createMockElement(tag)
  };
  const ctx = vm.createContext({
    document: doc,
    window: {},
    EventSource: class { addEventListener() {} },
    fetch: async () => ({ json: async () => ({}) }),
    prompt: () => null,
    alert: () => {}
  });
  return { ctx, getEl, map };
}

function collectDomMarkup(el) {
  return [el._html, ...(el.children ?? []).map(collectDomMarkup)].join('\n');
}

async function testDashboardAllowsExactLocalOrigin(t) {
  const ws = createTempWorkspace('aegis-f10-ok-');
  const { DashboardServer } = await import(DASHBOARD_URL);
  const srv = new DashboardServer({ port: 0, repoRoot: ws.dir, offline: true });
  const port = await srv.start();
  t.after(async () => {
    await srv.stop();
    ws.cleanup();
  });
  const origin = `http://127.0.0.1:${port}`;
  const res = await httpRequest(`${origin}/api/status`, { headers: { Origin: origin }, timeoutMs: 15000 });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], origin);
  const pre = await httpRequest(`${origin}/api/action`, {
    method: 'OPTIONS',
    headers: { Origin: `http://localhost:${port}` },
    timeoutMs: 15000
  });
  assert.equal(pre.status, 204);
}

async function testDashboardRejectsInvalidAndPortlessOrigins(t) {
  const ws = createTempWorkspace('aegis-f10-orig-');
  const { DashboardServer } = await import(DASHBOARD_URL);
  const srv = new DashboardServer({ port: 0, repoRoot: ws.dir, offline: true });
  const port = await srv.start();
  t.after(async () => {
    await srv.stop();
    ws.cleanup();
  });
  const badOrigins = [
    'https://evil.example.com',
    'http://localhost',
    'https://localhost',
    `http://localhost:${port + 1}`,
    'null'
  ];
  for (const origin of badOrigins) {
    const res = await httpRequest(`http://127.0.0.1:${port}/api/status`, {
      headers: { Origin: origin },
      timeoutMs: 15000
    });
    assert.equal(res.status, 403, `Expected 403 for Origin=${origin}, got ${res.status}`);
  }
}

async function testWsBridgeValidOriginAndTokenGuard(t) {
  const { WsBridgeServer } = await import(BRIDGE_URL);
  const wsSrv = new WsBridgeServer({ port: 0 });
  const port = await wsSrv.start();
  t.after(() => wsSrv.stop());
  const token = wsSrv.getSessionToken();
  const badTok = await wsHandshakeProbe(port, '/?token=wrong-token');
  assert.equal(badTok.statusCode, 401);
  assert.equal(badTok.accepted, false);
  const okNative = await wsHandshakeProbe(port, `/?token=${token}`);
  assert.equal(okNative.statusCode, 101);
  assert.equal(okNative.accepted, true);
}

async function testWsBridgeRejectsNullAndPrefixSpoofOrigins(t) {
  const { WsBridgeServer } = await import(BRIDGE_URL);
  const wsSrv = new WsBridgeServer({ port: 0 });
  const port = await wsSrv.start();
  t.after(() => wsSrv.stop());
  const token = wsSrv.getSessionToken();
  for (const badOrigin of ['null', 'http://localhost.evil.com', 'http://127.0.0.1.attacker.tld']) {
    const probe = await wsHandshakeProbe(port, `/?token=${token}`, badOrigin);
    assert.equal(probe.accepted, false, `Origin=${badOrigin} must not be accepted`);
    assert.equal(probe.statusCode, 403, `Expected 403 for Origin=${badOrigin}, got ${probe.statusCode}`);
  }
}

async function testDashboardXssEscapingInVm(t) {
  const ws = createTempWorkspace('aegis-f10-xss-');
  const { DashboardServer } = await import(DASHBOARD_URL);
  const srv = new DashboardServer({ port: 0, repoRoot: ws.dir, offline: true });
  const port = await srv.start();
  t.after(async () => {
    await srv.stop();
    ws.cleanup();
  });
  const html = (await httpRequest(`http://127.0.0.1:${port}/`)).body;
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Dashboard HTML must embed inline <script>');
  const { ctx, getEl, map } = makeDomSandbox();
  vm.runInContext(scriptMatch[1], ctx);
  const xss = '<img src=x onerror=alert(1)><script>alert(1)</script>';
  ctx.renderProjectSelector([{ id: xss, name: xss, isLocalBound: true }], { id: xss, name: xss });
  ctx.renderAgents([{ agentName: xss, ideType: xss, worktreePath: xss, status: 'active', lockedFiles: [xss] }]);
  ctx.renderKanban([{ number: 7, title: xss, status: 'in_progress', targetFiles: [xss] }]);
  ctx.appendLog(xss);
  const rendered = Array.from(map.values()).map(collectDomMarkup).join('\n');
  assert.equal(/<img\s+src=x|<script>alert\(1\)/i.test(rendered), false, 'XSS payload must be escaped in rendered DOM');
  assert.ok(getEl('log-box')._html.length > 0 || getEl('log-box').children.length > 0);
}

async function testDashboardActionCageCheckUsesRepoRoot(t) {
  const ws = createTempWorkspace('aegis-f10-root-');
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/bad.ts'), `${'export const a = 1;\n'.repeat(305)}`, 'utf8');
  const { DashboardServer } = await import(DASHBOARD_URL);
  const srv = new DashboardServer({ port: 0, repoRoot: ws.dir, offline: true });
  const port = await srv.start();
  t.after(async () => {
    await srv.stop();
    ws.cleanup();
  });
  const res = await httpRequest(`http://127.0.0.1:${port}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'run_engine_tool', tool: 'cage_check', dir: 'src' }),
    timeoutMs: 15000
  });
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.ok(parsed.result.violationsCount >= 1, 'Expected Demir Kafes violation on 305-line file');
  const relFile = parsed.result.violations[0].file;
  assert.equal(relFile.startsWith('..'), false, `Expected path relative to repoRoot, got: ${relFile}`);
  assert.equal(relFile, 'src/bad.ts');
}

async function testEngineAnalysisToolsBugTriageUsesRepoRoot(t) {
  const ws = createTempWorkspace('aegis-f10-triage-');
  t.after(ws.cleanup);
  fs.mkdirSync(path.join(ws.dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, 'src/oversize.ts'), `${'export const n = 1;\n'.repeat(305)}`, 'utf8');
  const { EngineAnalysisTools } = await import(ANALYSIS_TOOLS_URL);
  const tools = new EngineAnalysisTools(ws.dir);
  const cage = tools.runCageCheck('src');
  assert.equal(cage.violations[0].file, 'src/oversize.ts');
  const triage = tools.runBugTriage('src');
  assert.equal(triage.tool, 'bug_triage');
  assert.ok(triage.debtCount >= 1);
  assert.equal(triage.criticalCount, 0);
}

async function testDashboardSseSnapshotAndOriginCheck(t) {
  const ws = createTempWorkspace('aegis-f10-sse-');
  const { DashboardServer } = await import(DASHBOARD_URL);
  const srv = new DashboardServer({ port: 0, repoRoot: ws.dir, offline: true });
  const port = await srv.start();
  t.after(async () => {
    await srv.stop();
    ws.cleanup();
  });
  const http = await import('node:http');
  const blockedStatus = await new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/api/events`, { headers: { Origin: 'http://localhost' } }, (res) => {
      req.destroy();
      resolve(res.statusCode);
    });
    req.on('error', reject);
  });
  assert.equal(blockedStatus, 403, 'SSE endpoint must reject portless http://localhost Origin');
  const chunk = await new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/api/events`, (res) => {
      assert.equal(res.statusCode, 200);
      assert.match(String(res.headers['content-type']), /text\/event-stream/);
      res.once('data', (d) => {
        req.destroy();
        resolve(d.toString('utf8'));
      });
    });
    req.on('error', reject);
  });
  assert.match(chunk, /event:\s*snapshot/);
}

async function testWsBridgeLifecycleWithPortZero(t) {
  const { WsBridgeServer } = await import(BRIDGE_URL);
  const srv = new WsBridgeServer({ port: 0 });
  const port = await srv.start();
  t.after(() => srv.stop());
  const statusRes = await httpRequest(`http://127.0.0.1:${port}/status`);
  assert.equal(statusRes.status, 200);
  assert.equal(JSON.parse(statusRes.body).port, port);
  const spoof = await wsHandshakeProbe(port, `/?token=${srv.getSessionToken()}`, 'http://localhost.attacker.local');
  assert.equal(spoof.statusCode, 403);
  const ok = await wsHandshakeProbe(port, `/?token=${srv.getSessionToken()}`, `http://localhost:${port}`);
  assert.equal(ok.statusCode, 101);
}

async function testLiveCliDashboardProcess(t) {
  const ws = createTempWorkspace('aegis-f10-cli-');
  const freePort = await getFreePort();
  const handle = await spawnDashboardServer(freePort, ws.dir);
  t.after(async () => {
    await handle.stop();
    ws.cleanup();
  });
  const page = await httpRequest(`${handle.url}/`);
  assert.equal(page.status, 200);
  assert.match(String(page.headers['content-type']), /text\/html/);
  const denied = await httpRequest(`${handle.url}/api/status`, {
    headers: { Origin: 'https://attacker.example' }
  });
  assert.equal(denied.status, 403);
}

function registerTier1() {
  test('T1.1 DashboardServer allows exact local origin and OPTIONS preflight', testDashboardAllowsExactLocalOrigin);
  test('T1.2 DashboardServer rejects external, portless, and mismatched-port origins', testDashboardRejectsInvalidAndPortlessOrigins);
  test('T1.3 WsBridgeServer validates session token and native client upgrade', testWsBridgeValidOriginAndTokenGuard);
  test('T1.4 WsBridgeServer rejects null and prefix-spoofed origins with 403', testWsBridgeRejectsNullAndPrefixSpoofOrigins);
  test('T1.5 DASHBOARD_JS escapes XSS payloads across renderers and appendLog', testDashboardXssEscapingInVm);
}

function registerTier2() {
  test('T2.1 Dashboard POST /api/action cage_check resolves paths relative to repoRoot', testDashboardActionCageCheckUsesRepoRoot);
  test('T2.2 EngineAnalysisTools runCageCheck & runBugTriage use repoRoot', testEngineAnalysisToolsBugTriageUsesRepoRoot);
  test('T2.3 Dashboard SSE /api/events streams snapshot and enforces Origin guard', testDashboardSseSnapshotAndOriginCheck);
  test('T2.4 WsBridgeServer handles /status, spoof rejection, and valid upgrade', testWsBridgeLifecycleWithPortZero);
  test('T2.5 Live spawned CLI dashboard process serves HTML and blocks bad Origin', testLiveCliDashboardProcess);
}

describe('Tier 1: F10 Dashboard & WS Bridge Origin/XSS Security Contracts', registerTier1);
describe('Tier 2: F10 Live Dashboard, EngineTools & WS Bridge Integration', registerTier2);
