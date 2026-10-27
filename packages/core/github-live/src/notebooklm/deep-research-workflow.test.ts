/**
 * @file deep-research-workflow.test.ts
 * Tests for NotebookLmDeepResearchWorkflow with mock client & fast sleeper.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { NotebookLmDeepResearchWorkflow } from './deep-research-workflow.js';
import { NotebookLmNativeClient } from './notebooklm-native-client.js';

test('NotebookLmDeepResearchWorkflow starts research and returns task id', async () => {
  const mockHttp = async () => ({
    status: 200,
    text: async () => ')]}\'\n[["task_id": "task-deep-12345"]]',
    headers: {}
  });

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const workflow = new NotebookLmDeepResearchWorkflow(client);

  const res = await workflow.start('nb-1', 'Decoupled Architectures');
  assert.strictEqual(res.taskId, 'task-deep-12345');
});

test('NotebookLmDeepResearchWorkflow throws error when startResearch returns empty task', async () => {
  const mockHttp = async () => ({ status: 200, text: async () => ')]}\'\n[[]]', headers: {} });
  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const workflow = new NotebookLmDeepResearchWorkflow(client);

  await assert.rejects(
    async () => workflow.start('nb-1', 'Topic'),
    /Failed to initiate deep research/
  );
});

test('NotebookLmDeepResearchWorkflow returns immediately in detach mode', async () => {
  const mockHttp = async () => ({
    status: 200,
    text: async () => ')]}\'\n[["task_id": "task-async-999"]]',
    headers: {}
  });

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const workflow = new NotebookLmDeepResearchWorkflow(client);

  const res = await workflow.execute('nb-1', 'Event Bus', { detach: true });
  assert.strictEqual(res.taskId, 'task-async-999');
  assert.strictEqual(res.status, 'IN_PROGRESS');
});

test('NotebookLmDeepResearchWorkflow executes digest ingestion when requested', async () => {
  let addTextCalled = false;
  const mockHttp = async (_url: string, body: string) => {
    if (body.includes('StartResearch')) return { status: 200, text: async () => ')]}\'\n[["task_id": "task-digest-1"]]', headers: {} };
    if (body.includes('PollResearch')) return { status: 200, text: async () => ')]}\'\n[["COMPLETED", ["https://spec.org/1"]]]\nDeep synthesis.', headers: {} };
    if (body.includes('AddTextSource')) {
      addTextCalled = true;
      return { status: 200, text: async () => ')]}\'\n[["src-digest-uuid-123"]]', headers: {} };
    }
    if (body.includes('ListSources')) return { status: 200, text: async () => ')]}\'\n[[["src-1", "Doc 1"]]]', headers: {} };
    return { status: 200, text: async () => ')]}\'\n[]', headers: {} };
  };

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const workflow = new NotebookLmDeepResearchWorkflow(client);
  const res = await workflow.execute('nb-1', 'Clean Architecture', {
    ingestMode: 'digest',
    sleeper: async () => {},
    pollIntervalMs: 1
  });

  assert.strictEqual(res.status, 'COMPLETED');
  assert.strictEqual(res.ingestedSourceId, 'src-digest-uuid-123');
  assert.strictEqual(addTextCalled, true);
  assert.strictEqual(res.quotaWarning, false);
});

test('NotebookLmDeepResearchWorkflow executes curated ingestion by default', async () => {
  let importCalled = false;

  const mockHttp = async (_url: string, body: string) => {
    if (body.includes('StartResearch')) {
      return { status: 200, text: async () => ')]}\'\n[["task_id": "task-curated-1"]]', headers: {} };
    }
    if (body.includes('PollResearch')) {
      return {
        status: 200,
        text: async () => ')]}\'\n[["COMPLETED", ["https://ref1.com/guide", "https://ref2.com/spec"]]]\nSynthesis.',
        headers: {}
      };
    }
    if (body.includes('ImportDiscoveredSources')) {
      importCalled = true;
      return { status: 200, text: async () => ')]}\'\n[["ok"]]', headers: {} };
    }
    return { status: 200, text: async () => ')]}\'\n[]', headers: {} };
  };

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const workflow = new NotebookLmDeepResearchWorkflow(client);

  const res = await workflow.execute('nb-1', 'Signals', {
    maxCuratedSources: 2,
    sleeper: async () => {}
  });

  assert.strictEqual(res.status, 'COMPLETED');
  assert.strictEqual(importCalled, true);
  assert.strictEqual(res.curatedImportCount, 2);
});

test('NotebookLmDeepResearchWorkflow warns when source quota is high', async () => {
  const mockSources = Array.from({ length: 46 }, (_, i) => `["src-${i + 1000}", "Doc ${i}"]`).join(', ');
  const mockHttp = async (_url: string, body: string) => {
    if (body.includes('StartResearch')) {
      return { status: 200, text: async () => ')]}\'\n[["task_id": "task-quota-1"]]', headers: {} };
    }
    if (body.includes('PollResearch')) {
      return { status: 200, text: async () => ')]}\'\n[["COMPLETED"]]\nSynthesis.', headers: {} };
    }
    if (body.includes('ListSources')) {
      return { status: 200, text: async () => `)]}'\n[[${mockSources}]]`, headers: {} };
    }
    return { status: 200, text: async () => ')]}\'\n[["src-id-ok"]]', headers: {} };
  };

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const workflow = new NotebookLmDeepResearchWorkflow(client);

  const res = await workflow.execute('nb-1', 'Quota Check', { sleeper: async () => {} });
  assert.strictEqual(res.quotaWarning, true);
  assert.strictEqual(res.sourceCount, 46);
});

test('NotebookLmDeepResearchWorkflow formats readable digest markdown', () => {
  const poll = {
    status: 'COMPLETED' as const,
    taskId: 'task-1',
    synthesis: 'Deep findings synthesis.',
    sources: [{ title: 'Spec 1', url: 'https://spec1.org' }]
  };

  const md = NotebookLmDeepResearchWorkflow.formatDigest('Memory Management', poll);
  assert.ok(md.includes('# 📑 Deep Architectural Research: Memory Management'));
  assert.ok(md.includes('Deep findings synthesis.'));
  assert.ok(md.includes('1. **Spec 1**: https://spec1.org'));
});
