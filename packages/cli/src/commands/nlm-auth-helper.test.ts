/**
 * @file nlm-auth-helper.test.ts
 * Tests for nlm:auth command handler and interactive prompt helper.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { handleNlmAuth, promptInteractiveAuthResolution } from './nlm-auth-helper.js';

test('handleNlmAuth outputs status check when no arguments given', async () => {
  const originalLog = console.log;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmAuth();
    assert.ok(captured.some(l => l.includes('Inspecting Google NotebookLM Authentication')));
    assert.ok(captured.some(l => l.includes('Active Session:')));
  } finally {
    console.log = originalLog;
  }
});

test('handleNlmAuth --paste saves valid cookie string', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  const validCookie = 'SID=auth-test-valid-sid-1234567890; HSID=valid-hsid; __Secure-1PSIDTS=valid-psidts';
  try {
    await handleNlmAuth('--paste', validCookie);
    assert.ok(captured.some(l => l.includes('credentials saved successfully') || l.includes('Storage Path')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('handleNlmAuth --browser inspects CDP port safely', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmAuth('--browser', 'nonexistent-browser-xyz', '--port', '64888');
    assert.ok(captured.some(l => l.includes('Checking system browser CDP interface') || l.includes('Spawning Chromium-family browser')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('promptInteractiveAuthResolution defaults to OFFLINE_FALLBACK in CI / non-TTY', async () => {
  const res = await promptInteractiveAuthResolution({
    operation: 'query',
    errorDetails: 'Session expired'
  });
  assert.strictEqual(res, 'OFFLINE_FALLBACK');
});
