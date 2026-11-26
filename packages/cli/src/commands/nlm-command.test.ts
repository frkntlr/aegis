/**
 * @file nlm-command.test.ts
 * Tests for nlm-command CLI handler and argument parsing.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import {
  UnifiedKnowledgeOracle,
  NotebookLmResearchEngine,
  NotebookLmDeepResearchWorkflow,
  NotebookLmNativeClient
} from '@aegis/github-live';
import {
  parseNlmArgs,
  handleNlmQuery,
  handleNlmResearch,
  handleNlmSources,
  handleNlmPoll,
  handleNlmImport,
  handleNlmPrune,
  handleNlmRestore
} from './nlm-command.js';

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
  const parsed = parseNlmArgs(['--tier', 'context7', 'Godot questions']);
  assert.strictEqual(parsed.question, 'Godot questions');
  assert.strictEqual(parsed.preferredTier, 'context7');
  assert.strictEqual(parsed.forceOffline, false);
  assert.strictEqual(parseNlmArgs(['OnlyQ', '--tier']).preferredTier, undefined);
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

test('failed NotebookLM query reports a nonzero exit code without claiming a source', async t => {
  const previous = process.exitCode;
  const output: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(UnifiedKnowledgeOracle.prototype, 'query', async () => {
    throw new Error('User choice required: reauthenticate, explicitly continue local-only, or cancel.');
  });
  try {
    process.exitCode = 0;
    await handleNlmQuery('Hermetic auth failure');
    assert.strictEqual(process.exitCode, 1);
    assert.ok(output.some(line => line.includes('Unified Knowledge Query Failed: User choice required')));
    assert.ok(!output.some(line => line.includes('Source Tier:')));
  } finally {
    process.exitCode = previous;
  }
});

test('handleNlmResearch executes fast research flow cleanly', async t => {
  const previous = process.exitCode;
  const captured: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => captured.push(args.join(' ')));
  t.mock.method(NotebookLmResearchEngine.prototype, 'conductResearch', async (topic: string) => ({
    topic,
    mode: 'fast',
    sourcesCount: 2,
    sources: [{ title: 'Spec' }],
    synthesis: 'Mocked fast synthesis',
    citations: ['Spec'],
    recommendedCriteria: ['Keep Demir Kafes compliance'],
    createdAt: '2026-01-01T00:00:00Z'
  }));
  t.mock.method(NotebookLmResearchEngine.prototype, 'publishToWiki', () => false);
  try {
    process.exitCode = 0;
    await handleNlmResearch('Decoupled Micro-kernels', 'fast');
    assert.strictEqual(process.exitCode, 0);
    assert.ok(captured.some(line => line.includes('RESEARCH REPORT: Decoupled Micro-kernels')));
    assert.ok(captured.some(line => line.includes('Recommended Acceptance Criteria')));
  } finally {
    process.exitCode = previous;
  }
});

test('handleNlmResearch deep mode handles detach flag gracefully', async t => {
  const previous = process.exitCode;
  const captured: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => captured.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => captured.push(args.join(' ')));
  t.mock.method(NotebookLmDeepResearchWorkflow.prototype, 'execute', async () => ({
    taskId: 'task-deep-1',
    status: 'IN_PROGRESS',
    synthesis: '',
    sources: []
  }));
  try {
    process.exitCode = 0;
    await handleNlmResearch('Distributed consensus', '--deep', '--detach', 'nb-mock-123');
    assert.strictEqual(process.exitCode, 0);
    assert.ok(captured.some(line => line.includes('Initiating DEEP Research')));
    assert.ok(captured.some(line => line.includes('Task ID: task-deep-1')));
  } finally {
    process.exitCode = previous;
  }
});

test('handleNlmSources, handleNlmPoll, and handleNlmImport run gracefully', async t => {
  const previous = process.exitCode;
  const captured: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => captured.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => captured.push(args.join(' ')));
  t.mock.method(NotebookLmNativeClient.prototype, 'listSources', async () => [{ sourceId: 'src-1', title: 'Architecture Spec', isPinned: true }]);
  t.mock.method(NotebookLmDeepResearchWorkflow.prototype, 'poll', async () => ({ taskId: 'task-1', status: 'COMPLETED', sources: [], synthesis: 'Done' }));
  t.mock.method(NotebookLmNativeClient.prototype, 'addTextSource', async () => ({ sourceId: 'src-new-1' }));
  try {
    process.exitCode = 0;
    await handleNlmSources('nb-test-456');
    assert.ok(captured.some(l => l.includes('Architecture Spec')));
    await handleNlmPoll('task-1', 'nb-test-456');
    assert.ok(captured.some(l => l.includes('Research Task: task-1')));
    await handleNlmImport('task-1', 'nb-test-456');
    assert.ok(captured.some(l => l.includes('Ingested Synthesized Digest (Source ID: src-new-1)')));
    assert.strictEqual(process.exitCode, 0);
  } finally {
    process.exitCode = previous;
  }
});

test('nlm research, sources, poll, and import set process.exitCode = 1 on failure', async t => {
  const previous = process.exitCode;
  const errLogs: string[] = [];
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', (...args: unknown[]) => errLogs.push(args.join(' ')));
  t.mock.method(NotebookLmDeepResearchWorkflow.prototype, 'execute', async () => { throw new Error('deep err'); });
  t.mock.method(NotebookLmResearchEngine.prototype, 'conductResearch', async () => { throw new Error('fast err'); });
  t.mock.method(NotebookLmNativeClient.prototype, 'listSources', async () => { throw new Error('sources err'); });
  t.mock.method(NotebookLmDeepResearchWorkflow.prototype, 'poll', async () => { throw new Error('poll err'); });
  t.mock.method(NotebookLmNativeClient.prototype, 'addTextSource', async () => { throw new Error('import err'); });
  try {
    for (const run of [
      () => handleNlmResearch('Topic', '--deep', 'nb-1'),
      () => handleNlmResearch('Topic', 'fast', 'nb-1'),
      () => handleNlmSources('nb-1'),
      () => handleNlmPoll('t-1', 'nb-1'),
      () => handleNlmImport('t-1', 'nb-1')
    ]) {
      process.exitCode = 0;
      await run();
      assert.strictEqual(process.exitCode, 1);
    }
    assert.ok(errLogs.some(l => l.includes('deep err')));
    assert.ok(errLogs.some(l => l.includes('fast err')));
    assert.ok(errLogs.some(l => l.includes('sources err')));
    assert.ok(errLogs.some(l => l.includes('poll err')));
  } finally {
    process.exitCode = previous;
  }
});

test('handleNlmPrune executes autonomous and dry-run modes safely', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmPrune('nb-test-prune', '--dry-run');
    assert.ok(captured.some(line => line.includes('Autonomous Pruner') && line.includes('DRY-RUN')));

    captured.length = 0;
    await handleNlmPrune('nb-test-prune');
    assert.ok(captured.some(line => line.includes('Autonomous Pruner')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('handleNlmRestore lists vault contents and handles restore safely', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmRestore();
    assert.ok(captured.some(line => line.includes('Tombstone Vault Listing')));

    captured.length = 0;
    await handleNlmRestore('non-existent-source-id', 'nb-test-restore');
    assert.ok(captured.some(line => line.includes('Restoring source') || line.includes('Restore Failed')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('nlm handlers print citations, research boundaries, --import, and wiki sync cleanly', async t => {
  const captured: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => captured.push(args.join(' ')));
  t.mock.method(UnifiedKnowledgeOracle.prototype, 'query', async () => ({
    answer: 'Answer body', sourceTier: 'nlm' as const, authAlert: 'Warn',
    citations: [{ sourceId: 's1', title: '' }]
  }));
  await handleNlmQuery('Q1');
  assert.ok(captured.some(l => l.includes('Source reference')) && captured.some(l => l.includes('Warn')));
  const calls: Array<{ nbId: string; mode: string }> = [];
  t.mock.method(NotebookLmDeepResearchWorkflow.prototype, 'execute', async (nbId: string, _t: string, opts: { ingestMode?: string }) => {
    calls.push({ nbId, mode: opts.ingestMode ?? '' });
    if (nbId === 'nb-zero') return { taskId: 't0', status: 'COMPLETED', synthesis: 'S0', sources: [], curatedImportCount: 0, prunedCount: 0, quotaWarning: false, sourceCount: 1 };
    return { taskId: 't1', status: 'COMPLETED', synthesis: 'Deep synth', sources: [], curatedImportCount: 2, prunedCount: 1, quotaWarning: true, sourceCount: 45 };
  });
  await handleNlmResearch('Topic', '--deep', '--import', 'nb-imp');
  assert.deepStrictEqual(calls[0], { nbId: 'nb-imp', mode: 'curated' });
  assert.ok(captured.some(l => l.includes('Curated 2')) && captured.some(l => l.includes('pruned 1')) && captured.some(l => l.includes('45/50')));
  captured.length = 0;
  await handleNlmResearch('Topic', 'deep', 'nb-zero');
  assert.ok(!captured.some(l => l.includes('Curated') || l.includes('pruned') || l.includes('Quota Warning')));
  t.mock.method(NotebookLmResearchEngine.prototype, 'conductResearch', async () => ({
    topic: 'T', mode: 'fast' as const, sourcesCount: 1, sources: [], synthesis: 'S', citations: [], recommendedCriteria: [], createdAt: ''
  }));
  t.mock.method(NotebookLmResearchEngine.prototype, 'publishToWiki', () => true);
  await handleNlmResearch('Topic', 'fast', 'nb-fast');
  assert.ok(captured.some(l => l.includes('Report pushed to GitHub Wiki')) && !captured.some(l => l.includes('Recommended Acceptance Criteria')));
  t.mock.method(NotebookLmDeepResearchWorkflow.prototype, 'poll', async () => ({
    taskId: 'p1', status: 'COMPLETED', sources: [], synthesis: 'x'.repeat(320)
  }));
  await handleNlmPoll('p1');
  assert.ok(captured.some(l => l.includes('Synthesis preview:')));
});
