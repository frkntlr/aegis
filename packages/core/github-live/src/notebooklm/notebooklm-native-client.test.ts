/**
 * @file notebooklm-native-client.test.ts
 * Tests for NotebookLmNativeClient with mock HTTP transport.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { NotebookLmNativeClient } from './notebooklm-native-client.js';

test('NotebookLmNativeClient formats batch execute payloads cleanly', () => {
  const payload = NotebookLmNativeClient.formatBatchExecutePayload('TestRpc', ['param1', 123]);
  assert.ok(payload.startsWith('f.req='));
  assert.ok(payload.includes('TestRpc'));
});

test('NotebookLmNativeClient executes query and parses citations', async () => {
  const mockResponse = ')]}\'\n\n[["wrb.fr",null,null,null,null,[null,null,null]]]\nArchitectural analysis complete. [cite: RFC-001] [cite: ADR-02]';
  const mockHttp = async () => ({
    status: 200,
    text: async () => mockResponse,
    headers: { 'content-type': 'application/json' }
  });

  const client = new NotebookLmNativeClient({
    cookies: 'SID=testSid;',
    httpPost: mockHttp
  });

  const res = await client.query('nb-123', 'Explain architectural patterns');
  assert.ok(res.answer.includes('Architectural analysis complete'));
  assert.strictEqual(res.citations.length, 2);
  assert.strictEqual(res.citations[0].title, 'RFC-001');
  assert.strictEqual(res.citations[1].title, 'ADR-02');
});

test('NotebookLmNativeClient throws descriptive error on auth rejection', async () => {
  const mockHttp = async () => ({
    status: 401,
    text: async () => 'Unauthorized',
    headers: {}
  });

  const client = new NotebookLmNativeClient({
    cookies: 'SID=invalid;',
    httpPost: mockHttp
  });

  await assert.rejects(
    async () => client.query('nb-123', 'test'),
    /NotebookLM Authentication Rejected/
  );
});

test('NotebookLmNativeClient lists notebooks parsing UUIDs from response', async () => {
  const mockResponse = ')]}\'\n[["3767b1fc-5759-416d-b938-495b8138ccd7", "Aegis System Architecture"], ["11111111-2222-3333-4444-555555555555", "Godot Lab"]]';
  const mockHttp = async () => ({
    status: 200,
    text: async () => mockResponse,
    headers: {}
  });

  const client = new NotebookLmNativeClient({
    cookies: 'SID=test;',
    httpPost: mockHttp
  });

  const list = await client.listNotebooks();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].id, '3767b1fc-5759-416d-b938-495b8138ccd7');
  assert.strictEqual(list[1].id, '11111111-2222-3333-4444-555555555555');
});

test('NotebookLmNativeClient starts research and extracts task id', async () => {
  const mockResponse = ')]}\'\n[["task_id": "task-research-998877"]]';
  const mockHttp = async () => ({
    status: 200,
    text: async () => mockResponse,
    headers: {}
  });

  const client = new NotebookLmNativeClient({
    cookies: 'SID=test;',
    httpPost: mockHttp
  });

  const res = await client.startResearch('nb-123', 'Micro-kernels', 'web', 'fast');
  assert.strictEqual(res.task_id, 'task-research-998877');
});

test('NotebookLmNativeClient updates cookies dynamically', () => {
  const client = new NotebookLmNativeClient({ cookies: 'SID=initial;' });
  assert.strictEqual(client.getCookies(), 'SID=initial;');
  client.updateCookies('SID=updated; __Secure-1PSIDTS=ts;');
  assert.strictEqual(client.getCookies(), 'SID=updated; __Secure-1PSIDTS=ts;');
});
