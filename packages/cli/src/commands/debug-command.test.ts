import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  CliEvidenceProvider,
  CliLineBudgetInspector,
  CliTaskDispatcher,
  CliMemorySliceResolver
} from '../adapters/index.js';
import { handleDebugCommand } from './debug-command.js';

test('CliEvidenceProvider parses stack trace and compresses output', async () => {
  const provider = new CliEvidenceProvider();
  const stack = `TypeError: Cannot read property 'id' of undefined
    at DialogueEngine.startSession (packages/dialogue-engine/src/dialogue-engine.ts:45:10)
    at run (test/runner.ts:12:3)`;

  const evidence = await provider.parseEvidence(stack);
  assert.equal(evidence.confidenceScore > 0.5, true);
  assert.equal(evidence.lineNumber, 45);
  assert.ok(evidence.symbolName?.includes('startSession'));

  const rawTerminal = '• Running test in package\n✔ Test passed cleanly\nTypeError: Boom\n';
  const compressed = provider.compressContext(rawTerminal);
  assert.equal(compressed.includes('Boom'), true);
});

test('CliLineBudgetInspector inspects file lines and computes budget', async () => {
  const inspector = new CliLineBudgetInspector(300);
  const tmpFile = path.join(os.tmpdir(), `budget-test-${Date.now()}.ts`);
  fs.writeFileSync(tmpFile, Array.from({ length: 50 }, (_, i) => `// line ${i}`).join('\n'), 'utf8');

  try {
    const budget = await inspector.inspectBudget(tmpFile);
    assert.equal(budget.currentLines, 50);
    assert.equal(budget.remainingLines, 250);
    assert.equal(budget.mustDecompose, false);
    assert.equal(inspector.checkCompliance(tmpFile), true);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

test('CliTaskDispatcher writes task prompt and checks locks', async () => {
  const tmpDir = path.join(os.tmpdir(), `task-disp-test-${Date.now()}`);
  const promptsDir = path.join(tmpDir, '.aegis', 'prompts');

  try {
    const dispatcher = new CliTaskDispatcher({ repoRoot: tmpDir, promptsDir });
    const res = await dispatcher.dispatchTask('# My Surgical Task Prompt', {
      targetWorktree: 'solver',
      lockLabels: ['packages/cli/src/bin/aegis.ts']
    });

    assert.equal(res.success, true);
    assert.ok(res.filePathCreated);
    assert.equal(fs.existsSync(res.filePathCreated), true);
    assert.equal(fs.readFileSync(res.filePathCreated, 'utf8'), '# My Surgical Task Prompt');

    const lockStatus = await dispatcher.checkLocks(['packages/cli/src/bin/aegis.ts']);
    assert.equal(typeof lockStatus.isAvailable, 'boolean');
    assert.equal(Array.isArray(lockStatus.lockedFiles), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CliMemorySliceResolver handles resolution gracefully', async () => {
  const resolver = new CliMemorySliceResolver();
  const res = await resolver.resolveSlice('nonexistent.ts', 10, 'someSymbol');
  assert.equal(res === null || typeof res === 'object', true);
});

test('handleDebugCommand runs end-to-end 3-turn Socratic debug flow', async () => {
  const errorTrace = `Error: Cannot find module '@aegis/core'
    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:1144:15)
    at Object.<anonymous> (packages/cli/src/bin/aegis.ts:88:5)`;

  const result = await handleDebugCommand(errorTrace, { silent: true });
  assert.ok(result.session);
  assert.ok(result.taskPrompt);
  assert.equal(result.session.turnCount, 3);
  assert.equal(result.session.isResolved, true);
  assert.ok(result.taskPrompt.includes('Task:'));
  assert.ok(result.taskPrompt.includes(result.session.sessionId));
});
