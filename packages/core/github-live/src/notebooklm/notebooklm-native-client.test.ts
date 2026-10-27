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

  const client = new NotebookLmNativeClient({ cookies: 'SID=testSid;', httpPost: mockHttp });
  const res = await client.query('nb-123', 'Explain architectural patterns');
  assert.ok(res.answer.includes('Architectural analysis complete'));
  assert.strictEqual(res.citations.length, 2);
  assert.strictEqual(res.citations[0].title, 'RFC-001');
  assert.strictEqual(res.citations[1].title, 'ADR-02');
});

test('NotebookLmNativeClient throws descriptive error on auth rejection', async () => {
  const mockHttp = async () => ({ status: 401, text: async () => 'Unauthorized', headers: {} });
  const client = new NotebookLmNativeClient({ cookies: 'SID=invalid;', httpPost: mockHttp });

  await assert.rejects(
    async () => client.query('nb-123', 'test'),
    /NotebookLM Authentication Rejected/
  );
});

test('NotebookLmNativeClient lists notebooks parsing UUIDs from response', async () => {
  const mockResponse = ')]}\'\n[["3767b1fc-5759-416d-b938-495b8138ccd7", "Aegis System Architecture"], ["11111111-2222-3333-4444-555555555555", "Godot Lab"]]';
  const mockHttp = async () => ({ status: 200, text: async () => mockResponse, headers: {} });
  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });

  const list = await client.listNotebooks();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].id, '3767b1fc-5759-416d-b938-495b8138ccd7');
  assert.strictEqual(list[1].id, '11111111-2222-3333-4444-555555555555');
});

test('NotebookLmNativeClient starts research and extracts task id', async () => {
  const mockResponse = ')]}\'\n[["task_id": "task-research-998877"]]';
  const mockHttp = async () => ({ status: 200, text: async () => mockResponse, headers: {} });
  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });

  const res = await client.startResearch('nb-123', 'Micro-kernels', 'web', 'fast');
  assert.strictEqual(res.task_id, 'task-research-998877');
});

test('NotebookLmNativeClient polls research and returns discovered sources', async () => {
  const mockResponse = ')]}\'\n[["COMPLETED", ["https://arxiv.org/abs/123", "https://github.com/engine"]]]\nDeep synthesis summary.';
  const mockHttp = async () => ({ status: 200, text: async () => mockResponse, headers: {} });
  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });

  const res = await client.pollResearch('nb-123', 'task-123');
  assert.strictEqual(res.status, 'COMPLETED');
  assert.strictEqual(res.taskId, 'task-123');
  assert.strictEqual(res.sources.length, 2);
  assert.strictEqual(res.sources[0].url, 'https://arxiv.org/abs/123');
});

test('NotebookLmNativeClient adds text source and extracts source id', async () => {
  const mockResponse = ')]}\'\n[["src-9988-7766-5544-3322", "Architectural Digest"]]';
  const mockHttp = async () => ({ status: 200, text: async () => mockResponse, headers: {} });
  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });

  const res = await client.addTextSource('nb-123', 'Digest', '# Research');
  assert.strictEqual(res.sourceId, 'src-9988-7766-5544-3322');
});

test('NotebookLmNativeClient lists sources and deletes source', async () => {
  const listMock = ')]}\'\n[[["src-1122-3344", "RFC-001 Architecture"], ["src-5566-7788", "Godot API"]]]';
  const mockHttp = async (_url: string, body: string) => {
    if (body.includes('ListSources')) {
      return { status: 200, text: async () => listMock, headers: {} };
    }
    return { status: 200, text: async () => ')]}\'\n[["ok"]]', headers: {} };
  };

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const sources = await client.listSources('nb-123');
  assert.strictEqual(sources.length, 2);
  assert.strictEqual(sources[0].id, 'src-1122-3344');

  const del = await client.deleteSource('src-1122-3344');
  assert.strictEqual(del.success, true);
});

test('NotebookLmNativeClient imports discovered research sources', async () => {
  const mockHttp = async () => ({ status: 200, text: async () => ')]}\'\n[["success"]]', headers: {} });
  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });

  const res = await client.importResearchSources('nb-123', 'task-123', [0, 1]);
  assert.strictEqual(res.success, true);
});

test('NotebookLmNativeClient updates cookies dynamically', () => {
  const client = new NotebookLmNativeClient({ cookies: 'SID=initial;' });
  assert.strictEqual(client.getCookies(), 'SID=initial;');
  client.updateCookies('SID=updated; __Secure-1PSIDTS=ts;');
  assert.strictEqual(client.getCookies(), 'SID=updated; __Secure-1PSIDTS=ts;');
});
