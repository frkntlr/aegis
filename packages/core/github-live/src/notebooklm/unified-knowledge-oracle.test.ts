/**
 * @file unified-knowledge-oracle.test.ts
 * Tests for UnifiedKnowledgeOracle 3-tier cascade and resilient degradation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { UnifiedKnowledgeOracle } from './unified-knowledge-oracle.js';
import { NotebookLmNativeClient } from './notebooklm-native-client.js';

test('UnifiedKnowledgeOracle serves Tier 1 NotebookLM response when available', async () => {
  const mockHttp = async () => ({
    status: 200,
    text: async () => ')]}\'\n\nArchitectural analysis complete. [cite: RFC-001]',
    headers: {}
  });

  const client = new NotebookLmNativeClient({ cookies: 'SID=validSid;', httpPost: mockHttp });
  const oracle = new UnifiedKnowledgeOracle({ nativeClient: client });

  const res = await oracle.query('How does Aegis work?');
  assert.strictEqual(res.sourceTier, 'nlm');
  assert.ok(res.answer.includes('Architectural analysis complete'));
  assert.strictEqual(res.citations.length, 1);
});

test('UnifiedKnowledgeOracle injects freshness constraint by default', () => {
  const constrained = UnifiedKnowledgeOracle.applyFreshnessConstraint('Query text', {});
  assert.ok(constrained.includes('Query text'));
  assert.ok(constrained.includes('Prioritize the latest active architecture'));

  const raw = UnifiedKnowledgeOracle.applyFreshnessConstraint('Query text', { requireLatestActive: false });
  assert.strictEqual(raw, 'Query text');

  const custom = UnifiedKnowledgeOracle.applyFreshnessConstraint('Query text', { groundingDirective: 'Custom' });
  assert.ok(custom.includes('Custom'));
});

test('UnifiedKnowledgeOracle gracefully degrades to Tier 2 Context7 on NLM failure', async () => {
  const mockHttp = async () => ({
    status: 401,
    text: async () => 'Unauthorized',
    headers: {}
  });

  const client = new NotebookLmNativeClient({ cookies: 'invalid', httpPost: mockHttp });
  const oracle = new UnifiedKnowledgeOracle({
    nativeClient: client,
    context7Bridge: {
      query: (lib: string, topic: string) => ({
        matched: true,
        doc: {
          summary: `Ground-truth reference for ${lib}`,
          signatures: [`${lib}.${topic}() -> void`],
          version: '4.7.0'
        }
      })
    }
  });

  const res = await oracle.query('godot lifecycle hooks');
  assert.strictEqual(res.sourceTier, 'context7');
  assert.strictEqual(res.degradedFrom, 'nlm');
  assert.ok(res.authAlert?.includes('degraded to Context7'));
  assert.ok(res.answer.includes('Context7 Ground-Truth: GODOT4'));
});

test('UnifiedKnowledgeOracle gracefully degrades to Tier 3 Local AST when C7 misses', async () => {
  const mockHttp = async () => ({
    status: 500,
    text: async () => 'Internal Server Error',
    headers: {}
  });

  const client = new NotebookLmNativeClient({ cookies: 'invalid', httpPost: mockHttp });
  const oracle = new UnifiedKnowledgeOracle({
    nativeClient: client,
    context7Bridge: {
      query: () => ({ matched: false })
    },
    localMemoryProvider: (q: string) => `Local memory synthesized for: ${q}`
  });

  const res = await oracle.query('Custom AST query');
  assert.strictEqual(res.sourceTier, 'local_ast');
  assert.strictEqual(res.degradedFrom, 'nlm');
  assert.ok(res.answer.includes('Local memory synthesized for: Custom AST query'));
  assert.strictEqual(res.citations[0].sourceId, 'local://ast/graph');
});

test('UnifiedKnowledgeOracle directly uses Local AST when forceOffline is true', async () => {
  const oracle = new UnifiedKnowledgeOracle();
  const res = await oracle.query('Test offline mode', { forceOffline: true });

  assert.strictEqual(res.sourceTier, 'local_ast');
  assert.ok(res.answer.includes('[Local Living Memory]'));
  assert.strictEqual(res.degradedFrom, undefined);
});

test('UnifiedKnowledgeOracle directly respects preferredTier context7', async () => {
  const oracle = new UnifiedKnowledgeOracle({
    context7Bridge: {
      query: (lib: string) => ({
        matched: true,
        doc: {
          summary: `Doc for ${lib}`,
          signatures: ['func run()'],
          version: '1.0'
        }
      })
    }
  });

  const res = await oracle.query('Test query', { preferredTier: 'context7', libraryHint: 'typescript' });
  assert.strictEqual(res.sourceTier, 'context7');
  assert.strictEqual(res.degradedFrom, undefined);
  assert.ok(res.answer.includes('Context7 Ground-Truth: TYPESCRIPT'));
});
