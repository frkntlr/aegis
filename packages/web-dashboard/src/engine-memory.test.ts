import { test } from 'node:test';
import * as assert from 'node:assert';
import { AegisEngineService } from './server/engine-service.js';
import { DashboardServer } from './server/dashboard-server.js';
import { LoopBreaker } from '@aegis/watchdog';

test('AegisEngineService runs memory_query and memory_stats successfully', () => {
  const engine = new AegisEngineService();
  const stats = engine.runMemoryStats('test-dash');
  assert.strictEqual(stats.tool, 'memory_stats');
  assert.strictEqual(stats.worktreeId, 'test-dash');
  assert.ok(typeof stats.totalFiles === 'number');

  const query = engine.runMemoryQuery('IronCageValidator', 'test-dash');
  assert.strictEqual(query.tool, 'memory_query');
  assert.strictEqual(query.symbol, 'IronCageValidator');
  assert.ok(typeof query.found === 'boolean');
});

test('DashboardServer handles memory_query and memory_stats via API', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const statsRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run_engine_tool', tool: 'memory_stats', worktreeId: 'api-test' })
    });
    assert.strictEqual(statsRes.status, 200);
    const statsData = (await statsRes.json()) as { success: boolean; result: { tool: string } };
    assert.strictEqual(statsData.success, true);
    assert.strictEqual(statsData.result.tool, 'memory_stats');

    const queryRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run_engine_tool', tool: 'memory_query', symbol: 'IronCageValidator', worktreeId: 'api-test' })
    });
    assert.strictEqual(queryRes.status, 200);
    const queryData = (await queryRes.json()) as { success: boolean; result: { tool: string } };
    assert.strictEqual(queryData.success, true);
    assert.strictEqual(queryData.result.tool, 'memory_query');
  } finally {
    await server.stop();
  }
});

test('DashboardServer enforces Circuit Breaker loop_status, blocked tasks, and loop_reset', async () => {
  const breaker = new LoopBreaker({ maxFailures: 3, persistToDisk: false });
  breaker.recordFailure(999, 'Test failure 1');
  breaker.recordFailure(999, 'Test failure 2');
  breaker.recordFailure(999, 'Test failure 3');
  assert.strictEqual(breaker.isBlocked(999), true);

  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
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
  } finally {
    await server.stop();
  }
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
