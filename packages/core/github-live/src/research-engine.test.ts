/**
 * @file research-engine.test.ts
 * Tests for NotebookLmResearchEngine with decoupled NativeClient & UnifiedOracle.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { NotebookLmResearchEngine } from './research-engine.js';
import { UnifiedKnowledgeOracle } from './notebooklm/unified-knowledge-oracle.js';
import { NotebookLmNativeClient } from './notebooklm/notebooklm-native-client.js';

test('NotebookLmResearchEngine conducts research and synthesizes report with citations', async () => {
  const mockHttp = async (url: string) => {
    if (url.includes('batchexecute')) {
      return {
        status: 200,
        text: async () => ')]}\'\n[["task_id": "task-abc-123"]]\nSynthesized architectural intelligence. [cite: ADR-001] [cite: RFC-017]',
        headers: {}
      };
    }
    return { status: 404, text: async () => '', headers: {} };
  };

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const oracle = new UnifiedKnowledgeOracle({ nativeClient: client });
  const engine = new NotebookLmResearchEngine('nb-test', oracle, client);

  const report = await engine.conductResearch('Micro-kernel architecture', 'fast');
  assert.strictEqual(report.topic, 'Micro-kernel architecture');
  assert.strictEqual(report.mode, 'fast');
  assert.strictEqual(report.taskId, 'task-abc-123');
  assert.ok(report.synthesis.includes('Synthesized architectural intelligence'));
  assert.strictEqual(report.citations.length, 2);
  assert.strictEqual(report.recommendedCriteria.length, 3);
});

test('NotebookLmResearchEngine falls back cleanly when startResearch throws', async () => {
  const oracle = new UnifiedKnowledgeOracle();
  const engine = new NotebookLmResearchEngine('nb-offline', oracle);

  const report = await engine.conductResearch('Offline resilience', 'deep');
  assert.strictEqual(report.topic, 'Offline resilience');
  assert.strictEqual(report.taskId, undefined);
  assert.ok(report.synthesis.length > 0);
  assert.strictEqual(report.recommendedCriteria.length, 3);
});

test('NotebookLmResearchEngine publishes markdown report to wiki adapter', () => {
  const engine = new NotebookLmResearchEngine();
  const publishedPages: Record<string, { title: string; content: string }> = {};

  const mockWikiAdapter = {
    publishPage: (slug: string, title: string, _bullets: unknown, content: string) => {
      publishedPages[slug] = { title, content };
      return true;
    }
  };

  const report = {
    topic: 'Event Sourcing',
    mode: 'fast' as const,
    sourcesCount: 2,
    sources: [{ title: 'Source 1' }],
    synthesis: 'Event sourcing preserves full history.',
    citations: ['Source 1', 'Source 2'],
    recommendedCriteria: ['Write replay test'],
    createdAt: new Date().toISOString()
  };

  const success = engine.publishToWiki(mockWikiAdapter as never, report);
  assert.strictEqual(success, true);
  assert.strictEqual(publishedPages['research-event-sourcing'].title, 'Research: Event Sourcing');
  assert.ok(publishedPages['research-event-sourcing'].content.includes('Event sourcing preserves full history.'));
});
