/**
 * @file nlm-command.test.ts
 * Tests for nlm-command CLI handler and argument parsing.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { parseNlmArgs, handleNlmQuery, handleNlmResearch } from './nlm-command.js';

test('parseNlmArgs parses question and notebook id correctly', () => {
  const parsed = parseNlmArgs(['What is Aegis?', 'nb-123']);
  assert.strictEqual(parsed.question, 'What is Aegis?');
  assert.strictEqual(parsed.notebookId, 'nb-123');
  assert.strictEqual(parsed.forceOffline, false);
  assert.strictEqual(parsed.preferredTier, undefined);
});

test('parseNlmArgs parses --offline flag accurately', () => {
  const parsed = parseNlmArgs(['Architecture query', '--offline']);
  assert.strictEqual(parsed.question, 'Architecture query');
  assert.strictEqual(parsed.notebookId, undefined);
  assert.strictEqual(parsed.forceOffline, true);
});

test('parseNlmArgs parses --tier flag with parameter', () => {
  const parsed = parseNlmArgs(['Godot questions', '--tier', 'context7']);
  assert.strictEqual(parsed.question, 'Godot questions');
  assert.strictEqual(parsed.preferredTier, 'context7');
  assert.strictEqual(parsed.forceOffline, false);
});

test('parseNlmArgs parses inline --tier=local_ast format', () => {
  const parsed = parseNlmArgs(['Offline local query', '--tier=local_ast']);
  assert.strictEqual(parsed.question, 'Offline local query');
  assert.strictEqual(parsed.preferredTier, 'local_ast');
});

test('handleNlmQuery executes without crashing on offline mode', async () => {
  const originalLog = console.log;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmQuery('Explain architecture', '--offline');
    assert.ok(captured.some(line => line.includes('Unified Knowledge Oracle')));
    assert.ok(captured.some(line => line.includes('Source Tier: [LOCAL_AST]')));
  } finally {
    console.log = originalLog;
  }
});

test('handleNlmResearch executes fast research flow cleanly', async () => {
  const originalLog = console.log;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmResearch('Decoupled Micro-kernels', 'fast');
    assert.ok(captured.some(line => line.includes('RESEARCH REPORT: Decoupled Micro-kernels')));
    assert.ok(captured.some(line => line.includes('Recommended Acceptance Criteria')));
  } finally {
    console.log = originalLog;
  }
});
