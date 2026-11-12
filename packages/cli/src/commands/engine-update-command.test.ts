import { test } from 'node:test';
import * as assert from 'node:assert';
import { handleVersionStatus, handleEngineUpdate } from './engine-update-command.js';
import { EngineUpdater, type EngineUpdateResult } from '@aegis/orchestrator';

test('handleVersionStatus executes without exceptions', () => {
  assert.doesNotThrow(() => {
    handleVersionStatus('--json');
  });
  assert.doesNotThrow(() => {
    handleVersionStatus();
  });
});

test('handleEngineUpdate in check mode returns null gracefully', () => {
  const result = handleEngineUpdate('--check', '--json');
  assert.strictEqual(result, null);

  const resCheck = handleEngineUpdate('--check', '--bump=minor');
  assert.strictEqual(resCheck, null);
});

test('failed update returns failure JSON and a nonzero exit code', t => {
  const previousExitCode = process.exitCode;
  const failed: EngineUpdateResult = { success: false, previousVersion: '1.0.0', newVersion: '1.0.0',
    commitHash: 'old', cleaned: false, built: false, reinstalledShims: 0, syncedPlugins: false,
    syncedIdes: [], syncedWorktrees: 0, durationMs: 1, message: 'Pull failed' };
  const logs: string[] = [];
  t.mock.method(EngineUpdater, 'runUpdate', () => failed);
  t.mock.method(console, 'log', (line: string) => { logs.push(line); });
  try {
    assert.strictEqual(handleEngineUpdate('--pull', '--json'), failed);
    assert.strictEqual(process.exitCode, 1);
    assert.strictEqual(JSON.parse(logs[0]).success, false);
  } finally { process.exitCode = previousExitCode; }
});
