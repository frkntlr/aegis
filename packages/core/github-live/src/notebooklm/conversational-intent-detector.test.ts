/**
 * @file conversational-intent-detector.test.ts
 * Tests for ConversationalIntentDetector natural language intent parsing.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { ConversationalIntentDetector } from './conversational-intent-detector.js';

test('detect recognizes Turkish account switch intents', () => {
  const p1 = ConversationalIntentDetector.detect('başka bir hesaba geçelim');
  assert.strictEqual(p1.matched, true);
  assert.strictEqual(p1.type, 'ACCOUNT_SWITCH');
  assert.strictEqual(p1.suggestedAction, 'execute_account_switch');

  const p2 = ConversationalIntentDetector.detect('farklı bir hesapla giriş yap');
  assert.strictEqual(p2.matched, true);
  assert.strictEqual(p2.type, 'ACCOUNT_SWITCH');

  const p3 = ConversationalIntentDetector.detect('hesabı değiştirelim lütfen');
  assert.strictEqual(p3.matched, true);
  assert.strictEqual(p3.type, 'ACCOUNT_SWITCH');
});

test('detect recognizes English account switch intents and extracts browser preference', () => {
  const p1 = ConversationalIntentDetector.detect('please switch account to another user using brave');
  assert.strictEqual(p1.matched, true);
  assert.strictEqual(p1.type, 'ACCOUNT_SWITCH');
  assert.strictEqual(p1.preferredBrowser, 'brave');

  const p2 = ConversationalIntentDetector.detect('change account with chrome');
  assert.strictEqual(p2.matched, true);
  assert.strictEqual(p2.type, 'ACCOUNT_SWITCH');
  assert.strictEqual(p2.preferredBrowser, 'chrome');
});

test('detect recognizes session reset and logout requests', () => {
  const p1 = ConversationalIntentDetector.detect('oturumumu sıfırla');
  assert.strictEqual(p1.matched, true);
  assert.strictEqual(p1.type, 'SESSION_RESET');
  assert.strictEqual(p1.suggestedAction, 'reset_session');

  const p2 = ConversationalIntentDetector.detect('çıkış yap ve çerezleri temizle');
  assert.strictEqual(p2.matched, true);
  assert.strictEqual(p2.type, 'SESSION_RESET');

  const p3 = ConversationalIntentDetector.detect('please log out from notebooklm');
  assert.strictEqual(p3.matched, true);
  assert.strictEqual(p3.type, 'SESSION_RESET');
});

test('detect recognizes force reauth and status queries', () => {
  const p1 = ConversationalIntentDetector.detect('oturumumu yenile');
  assert.strictEqual(p1.matched, true);
  assert.strictEqual(p1.type, 'FORCE_REAUTH');

  const p2 = ConversationalIntentDetector.detect('hesap durumum nedir açık mı?');
  assert.strictEqual(p2.matched, true);
  assert.strictEqual(p2.type, 'AUTH_STATUS');
});

test('detect returns NONE for normal engineering prompts', () => {
  const p1 = ConversationalIntentDetector.detect('add test coverage for iron cage');
  assert.strictEqual(p1.matched, false);
  assert.strictEqual(p1.type, 'NONE');

  const p2 = ConversationalIntentDetector.detect('');
  assert.strictEqual(p2.matched, false);
  assert.strictEqual(p2.type, 'NONE');
});
