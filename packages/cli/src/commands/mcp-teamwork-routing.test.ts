/**
 * @file mcp-teamwork-routing.test.ts
 * Tests for tr_* and tw_* MCP tool routing in mcp-tool-dispatcher.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { executeMcpTool } from './mcp-tool-dispatcher.js';

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

test('executeMcpTool routes all tr_* tools without error', async () => {
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
});

test('executeMcpTool routes tw_* alias tools with full parity', async () => {
  const twStatus = await executeMcpTool('tw_status', {});
  const statusParsed = JSON.parse(twStatus) as Record<string, unknown>;
  assert.ok(Array.isArray(statusParsed.profiles));

  const twMesh = await executeMcpTool('tw_mesh_read', {});
  const meshParsed = JSON.parse(twMesh) as Record<string, unknown>;
  assert.strictEqual(typeof meshParsed.planId, 'string');

  const twPush = await executeMcpTool('tw_push', { dryRun: true });
  const pushParsed = JSON.parse(twPush) as Record<string, unknown>;
  assert.strictEqual(pushParsed.success, true);
});
