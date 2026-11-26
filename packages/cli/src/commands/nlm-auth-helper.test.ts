/**
 * @file nlm-auth-helper.test.ts
 * Tests for nlm:auth command handler, clipboard extraction, and interactive prompt helper.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { handleNlmAuth, promptInteractiveAuthResolution, runClipboardAuth, runRotateAuth } from './nlm-auth-helper.js';
import { handlePromptChoice } from './nlm-auth-interactive.js';

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

test('handleNlmAuth --browser with --force inspects CDP port safely', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await handleNlmAuth('--browser', 'nonexistent-browser-xyz', '--port', '64888', '--force');
    assert.ok(captured.some(l => l.includes('Checking system browser CDP interface') || l.includes('Spawning Chromium-family browser')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('runClipboardAuth fails cleanly when clipboard is empty', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    const res = await runClipboardAuth();
    assert.strictEqual(typeof res, 'boolean');
    assert.ok(captured.some(l => l.includes('clipboard')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('runRotateAuth handles rotation attempt gracefully', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { captured.push(args.join(' ')); };

  try {
    await runRotateAuth();
    assert.ok(captured.some(l => l.includes('rotation')));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('noninteractive authentication requires an explicit user choice', async () => {
  const previous = process.env.CI;
  process.env.CI = '1';
  try {
    await assert.rejects(promptInteractiveAuthResolution({ operation: 'query', errorDetails: 'Session expired' }),
      /query: Session expired.*reauthenticate.*local-only.*cancel/);
  } finally {
    if (previous === undefined) delete process.env.CI;
    else process.env.CI = previous;
  }
});

test('only explicit local-only choice authorizes fallback', async () => {
  const failed = async () => false;
  assert.strictEqual(await handlePromptChoice('4', failed, failed), 'OFFLINE_FALLBACK');
  assert.strictEqual(await handlePromptChoice('5', failed, failed), 'ABORT');
  await assert.rejects(handlePromptChoice('', failed, failed), /Invalid choice/);
  await assert.rejects(handlePromptChoice('1', failed, failed), /reauthentication failed/);
  await assert.rejects(handlePromptChoice('2', failed, failed), /reauthentication failed/);
  assert.strictEqual(await handlePromptChoice('1', async () => true, failed), 'REAUTH');
});
