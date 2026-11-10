import { test, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AegisEngineService } from './server/engine-service.js';
import { DashboardServer } from './server/dashboard-server.js';
import { LoopBreaker } from '@aegis/watchdog';
import { CodebaseMemoryEngine } from '@aegis/ast-skeleton';

let server: DashboardServer;
let port: number;
let tmpDir: string;
const previousWorkspace = process.env.AEGIS_WORKSPACE;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mem-srv-'));
  process.env.AEGIS_WORKSPACE = tmpDir;
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(path.join(tmpDir, 'src/memory-fixture.ts'),
    'export class DashboardMemoryFixture { public read(): number { return 42; } }\n');
  server = new DashboardServer({ port: 0, repoRoot: tmpDir, offline: true });
  port = await server.start();
});

after(async () => {
  await server.stop();
  if (previousWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
  else process.env.AEGIS_WORKSPACE = previousWorkspace;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('AegisEngineService runs memory_query and memory_stats successfully', () => {
  const engine = new AegisEngineService();
  const stats = engine.runMemoryStats('test-dash');
  assert.strictEqual(stats.tool, 'memory_stats');
  assert.strictEqual(stats.worktreeId, 'test-dash');
  assert.strictEqual(stats.totalFiles, 1);
  assert.ok(Number(stats.totalSymbols) >= 1);

  const query = engine.runMemoryQuery('DashboardMemoryFixture', 'test-dash');
  assert.strictEqual(query.tool, 'memory_query');
  assert.strictEqual(query.symbol, 'DashboardMemoryFixture');
  assert.strictEqual(query.found, true);
  assert.ok(String(query.filePath).endsWith('/src/memory-fixture.ts'));
});

test('dashboard memory requests reuse their index instead of repeating cold scans', t => {
  const index = t.mock.method(CodebaseMemoryEngine.prototype, 'indexDirectory');
  const engine = new AegisEngineService(tmpDir);
  assert.strictEqual(engine.runMemoryStats('reuse-check').totalFiles, 1);
  assert.strictEqual(engine.runMemoryQuery('DashboardMemoryFixture', 'reuse-check').found, true);
  assert.strictEqual(engine.runMemoryStats('reuse-check').totalFiles, 1);
  assert.strictEqual(index.mock.callCount(), 1);
});

test('DashboardServer handles memory_query and memory_stats via API', async () => {
  const statsRes = await fetch(`http://localhost:${port}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'run_engine_tool', tool: 'memory_stats', worktreeId: 'api-test' })
  });
  assert.strictEqual(statsRes.status, 200);
  const statsData = (await statsRes.json()) as { success: boolean; result: { tool: string; totalFiles: number } };
  assert.strictEqual(statsData.success, true);
  assert.strictEqual(statsData.result.tool, 'memory_stats');
  assert.strictEqual(statsData.result.totalFiles, 1);

  const queryRes = await fetch(`http://localhost:${port}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'run_engine_tool', tool: 'memory_query', symbol: 'DashboardMemoryFixture', worktreeId: 'api-test' })
  });
  assert.strictEqual(queryRes.status, 200);
  const queryData = (await queryRes.json()) as { success: boolean; result: { tool: string; found: boolean; filePath: string } };
  assert.strictEqual(queryData.success, true);
  assert.strictEqual(queryData.result.tool, 'memory_query');
  assert.strictEqual(queryData.result.found, true);
  assert.ok(queryData.result.filePath.endsWith('/src/memory-fixture.ts'));
});

test('explicit dashboard project root stays isolated from the ambient workspace', async () => {
  const selectedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-selected-project-'));
  const selectedServer = new DashboardServer({ port: 0, repoRoot: selectedRoot, offline: true });
  try {
    fs.writeFileSync(path.join(selectedRoot, 'selected.ts'),
      'export class SelectedProjectFixture { public read(): number { return 7; } }\n');
    const selectedPort = await selectedServer.start();
    const response = await fetch(`http://localhost:${selectedPort}/api/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run_engine_tool', tool: 'memory_query', symbol: 'SelectedProjectFixture' })
    });
    const data = await response.json() as { success: boolean; result: { found: boolean; filePath: string } };
    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.result.found, true);
    assert.strictEqual(data.result.filePath, path.join(selectedRoot, 'selected.ts').replace(/\\/g, '/'));
    const engine = new AegisEngineService(selectedRoot);
    assert.strictEqual(engine.runMemoryStats().totalFiles, 1);
    assert.strictEqual(engine.runMemoryQuery('DashboardMemoryFixture').found, false);
    assert.strictEqual(engine.runMemoryStats().totalFiles, 1);
  } finally {
    await selectedServer.stop();
    fs.rmSync(selectedRoot, { recursive: true, force: true });
  }
});

test('DashboardServer enforces Circuit Breaker loop_status, blocked tasks, and loop_reset', async () => {
  const breaker = new LoopBreaker({ maxFailures: 3, persistToDisk: false });
  breaker.recordFailure(999, 'Test failure 1');
  breaker.recordFailure(999, 'Test failure 2');
  breaker.recordFailure(999, 'Test failure 3');
  assert.strictEqual(breaker.isBlocked(999), true);

  const statusRes = await fetch(`http://localhost:${port}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'loop_status' })
  });
  assert.strictEqual(statusRes.status, 200);
  const statusData = (await statusRes.json()) as { success: boolean; records: unknown[] };
  assert.strictEqual(statusData.success, true);

  const resetRes = await fetch(`http://localhost:${port}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'loop_reset', issueNumber: 999 })
  });
  assert.strictEqual(resetRes.status, 200);
  const resetData = (await resetRes.json()) as { success: boolean; message: string };
  assert.strictEqual(resetData.success, true);
  assert.ok(resetData.message.includes('999'));
});

test('DashboardServer executes ast_search, rtk_compress, and context7_query tools', async () => {
  const engine = new AegisEngineService();
  const astRes = engine.runAstSearch('class $NAME');
  assert.strictEqual(astRes.tool, 'ast_search');
  assert.strictEqual(typeof astRes.matchCount, 'number');

  const rtkRes = engine.runRtkCompress('error\n    at node:internal/test:1:1\nok');
  assert.strictEqual(rtkRes.tool, 'rtk_compress');
  assert.strictEqual(typeof rtkRes.tokenSavingsPercent, 'number');

  const c7Res = engine.runContext7Query('godot4', 'lifecycle');
  assert.strictEqual(c7Res.tool, 'context7_query');
  assert.strictEqual(c7Res.found, true);
});
