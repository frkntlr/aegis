import { test } from 'node:test';
import * as assert from 'node:assert';
import { handleVersionStatus, handleEngineUpdate } from './engine-update-command.js';

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
