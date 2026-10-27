/**
 * @file nlm-switch-helper.test.ts
 * Tests for nlm:switch command and zero-click session import workflow.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { handleNlmSwitch, runZeroClickSessionImport } from './nlm-switch-helper.js';

test('runZeroClickSessionImport returns a boolean status safely', async () => {
  const originalLog = console.log;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    const res = await runZeroClickSessionImport();
    assert.strictEqual(typeof res, 'boolean');
    assert.ok(captured.some(l => l.includes('Checking running browsers')));
  } finally {
    console.log = originalLog;
  }
});

test('handleNlmSwitch logs initiating message and attempts switch', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmSwitch('nonexistent-browser-xyz');
    assert.ok(captured.some(l => l.includes('Initiating Google NotebookLM Account Switch')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});
