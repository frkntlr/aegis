/**
 * @file mcp-teamwork-routing.test.ts
 * Tests for tr_* and tw_* MCP tool routing in mcp-tool-dispatcher.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test, { type TestContext } from 'node:test';
import * as assert from 'node:assert';
import { executeMcpTool, CORE_MCP_TOOLS } from './mcp-tool-dispatcher.js';
import { GitPushManager } from './git-push-command.js';

function mockDryRunPush(t: TestContext) {
  t.after(() => t.mock.restoreAll());
  t.mock.method(GitPushManager.prototype, 'checkAuthStatus', () => ({ authenticated: true }));
  t.mock.method(GitPushManager.prototype, 'detectCurrentBranch', () => 'fixture-main');
  t.mock.method(GitPushManager.prototype, 'isAheadOfRemote', () => ({ ahead: true, count: 1 }));
  t.mock.method(GitPushManager.prototype, 'hasUncommittedChanges', () => false);
  return t.mock.method(GitPushManager.prototype, 'executePush', () => ({ success: true, message: 'Dry-run fixture' }));
}

test('executeMcpTool executes tr_status and returns valid JSON', async () => {
  const raw = await executeMcpTool('tr_status', {});
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.strictEqual(typeof parsed.activeTracksCount, 'number');
  assert.ok(Array.isArray(parsed.profiles));
  assert.strictEqual((parsed.profiles as unknown[]).length, 4);
});

test('executeMcpTool executes tr_mesh_read and returns valid JSON', async () => {
  const raw = await executeMcpTool('tr_mesh_read', {});
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.strictEqual(typeof parsed.planId, 'string');
  assert.strictEqual(typeof parsed.activeWave, 'number');
});

test('executeMcpTool routes all tr_* tools without error', async t => {
  const push = mockDryRunPush(t);
  const planRaw = await executeMcpTool('tr_plan', { objective: 'Test TR routing' });
  assert.ok(planRaw.includes('planId'));

  const wavesRaw = await executeMcpTool('tr_waves', { objective: 'Test waves' });
  assert.ok(wavesRaw.includes('waves'));

  const peersRaw = await executeMcpTool('tr_peers', {});
  assert.ok(peersRaw.startsWith('['));

  const postRaw = await executeMcpTool('tr_mesh_post', { agentId: 'test-solver', activity: 'Testing' });
  assert.ok(postRaw.includes('test-solver'));

  const docRaw = await executeMcpTool('tr_doc_synthesize', { compact: true });
  assert.ok(docRaw.startsWith('[ARCH-SYNTHESIS:'));

  const pushRaw = await executeMcpTool('tr_push', { dryRun: true });
  const pushParsed = JSON.parse(pushRaw) as Record<string, unknown>;
  assert.strictEqual(pushParsed.success, true);
  assert.strictEqual(push.mock.callCount(), 1);
  assert.deepStrictEqual(push.mock.calls[0].arguments, ['fixture-main', true]);
});

test('executeMcpTool routes tw_* alias tools with full parity', async t => {
  const push = mockDryRunPush(t);
  const twStatus = await executeMcpTool('tw_status', {});
  const statusParsed = JSON.parse(twStatus) as Record<string, unknown>;
  assert.ok(Array.isArray(statusParsed.profiles));

  const twMesh = await executeMcpTool('tw_mesh_read', {});
  const meshParsed = JSON.parse(twMesh) as Record<string, unknown>;
  assert.strictEqual(typeof meshParsed.planId, 'string');

  const twPush = await executeMcpTool('tw_push', { dryRun: true });
  const pushParsed = JSON.parse(twPush) as Record<string, unknown>;
  assert.strictEqual(pushParsed.success, true);
  assert.strictEqual(push.mock.callCount(), 1);
  assert.deepStrictEqual(push.mock.calls[0].arguments, ['fixture-main', true]);
});

test('executeMcpTool routes teamwork_report, tw_report and tr_report', async () => {
  const fullRaw = await executeMcpTool('teamwork_report', {});
  assert.ok(fullRaw.includes('Aegis Teamwork Mission Report'));

  const jsonRaw = await executeMcpTool('tw_report', { json: true });
  const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;
  assert.strictEqual(typeof parsed.planId, 'string');
  assert.ok(parsed.concurrency);

  const compactRaw = await executeMcpTool('tr_report', { compact: true });
  assert.ok(compactRaw.startsWith('[TW-REPORT:'));
});

test('CORE_MCP_TOOLS exposes all 7 parity teamwork tools with correct schemas', () => {
  const byName = new Map(CORE_MCP_TOOLS.map(t => [t.name, t]));
  const required = [
    'teamwork_test',
    'teamwork_advance',
    'teamwork_clear',
    'teamwork_matrix',
    'teamwork_batch',
    'teamwork_deliberate',
    'teamwork_swarm'
  ];
  for (const name of required) {
    assert.ok(byName.has(name), `Missing schema for ${name}`);
  }
  const testSchema = byName.get('teamwork_test')?.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(testSchema.properties?.target);
  assert.ok(testSchema.properties?.offline);

  const advSchema = byName.get('teamwork_advance')?.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(advSchema.properties?.planId);

  const clearSchema = byName.get('teamwork_clear')?.inputSchema as { properties?: Record<string, unknown> };
  assert.deepStrictEqual(clearSchema.properties, {});

  const matrixSchema = byName.get('teamwork_matrix')?.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(matrixSchema.properties?.objective);

  const batchSchema = byName.get('teamwork_batch')?.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(batchSchema.properties?.planId);

  const delibSchema = byName.get('teamwork_deliberate')?.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(delibSchema.properties?.objective);

  const swarmSchema = byName.get('teamwork_swarm')?.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(swarmSchema.properties?.objective);
});

test('executeMcpTool routes teamwork_clear and aliases', async () => {
  for (const tool of ['teamwork_clear', 'tw_clear', 'tr_clear']) {
    const raw = await executeMcpTool(tool, {});
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(typeof parsed.tasksCleared, 'number');
    assert.strictEqual(typeof parsed.locksCleared, 'number');
  }
});

test('executeMcpTool routes teamwork_advance and aliases', async () => {
  for (const tool of ['teamwork_advance', 'tw_advance', 'tr_advance']) {
    const raw = await executeMcpTool(tool, { planId: 'tw-test' });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.strictEqual(typeof parsed.advanced, 'boolean');
    assert.strictEqual(typeof parsed.currentWave, 'number');
    assert.strictEqual(typeof parsed.nextPhase, 'string');
  }
});

test('executeMcpTool routes teamwork_matrix and aliases', async () => {
  for (const tool of ['teamwork_matrix', 'tw_matrix', 'tr_matrix']) {
    const raw = await executeMcpTool(tool, { objective: 'Test matrix parity' });
    assert.ok(typeof raw === 'string');
    assert.ok(raw.includes('Matrisi') || raw.includes('Faz'));
  }
});

test('executeMcpTool routes teamwork_batch and aliases', async () => {
  for (const tool of ['teamwork_batch', 'tw_batch', 'tr_batch']) {
    const raw = await executeMcpTool(tool, { planId: 'tw-test' });
    const parsed = JSON.parse(raw) as unknown[];
    assert.ok(Array.isArray(parsed));
  }
});

test('executeMcpTool routes teamwork_deliberate and aliases', async () => {
  for (const tool of ['teamwork_deliberate', 'tw_deliberate', 'tr_deliberate']) {
    const raw = await executeMcpTool(tool, { objective: 'Test multi-agent deliberation' });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.strictEqual(typeof parsed.deliberationId, 'string');
    assert.ok(parsed.consensus);
  }
});

test('executeMcpTool routes teamwork_swarm and aliases', async () => {
  for (const tool of ['teamwork_swarm', 'tw_swarm', 'tr_swarm']) {
    const raw = await executeMcpTool(tool, { objective: 'Test analysis swarm' });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.strictEqual(typeof parsed.swarmId, 'string');
    assert.strictEqual(typeof parsed.totalInsights, 'number');
  }
});

test('executeMcpTool routes teamwork_test and aliases', async () => {
  for (const tool of ['teamwork_test', 'tw_test', 'tr_test']) {
    const raw = await executeMcpTool(tool, { timeoutMs: 200 });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.strictEqual(typeof parsed.passed, 'boolean');
    assert.strictEqual(typeof parsed.durationMs, 'number');
  }
});

