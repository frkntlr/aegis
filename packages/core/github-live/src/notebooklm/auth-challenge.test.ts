/**
 * @file auth-challenge.test.ts
 * Tests for NotebookLmAuthError, AuthChallengeContext, and Oracle challenge hooks.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import {
  NotebookLmAuthError,
  type AuthChallengeContext
} from './auth-challenge.js';
import { UnifiedKnowledgeOracle } from './unified-knowledge-oracle.js';
import { NotebookLmNativeClient } from './notebooklm-native-client.js';

test('NotebookLmAuthError instantiates with context and code', () => {
  const ctx: AuthChallengeContext = {
    operation: 'query',
    notebookId: 'nb-123',
    statusCode: 401,
    errorDetails: 'Session expired'
  };
  const err = new NotebookLmAuthError('Auth challenge required', ctx);

  assert.strictEqual(err.name, 'NotebookLmAuthError');
  assert.strictEqual(err.code, 'AUTH_REQUIRED_INTERACTIVE');
  assert.strictEqual(err.context.notebookId, 'nb-123');
  assert.strictEqual(err.context.statusCode, 401);
  assert.strictEqual(err.isInteractiveRequired(), true);
  assert.strictEqual(NotebookLmAuthError.isAuthError(err), true);
});

test('NotebookLmAuthError.isAuthError rejects standard errors or non-objects', () => {
  assert.strictEqual(NotebookLmAuthError.isAuthError(new Error('Generic')), false);
  assert.strictEqual(NotebookLmAuthError.isAuthError('some string'), false);
  assert.strictEqual(NotebookLmAuthError.isAuthError(null), false);
  assert.strictEqual(NotebookLmAuthError.isAuthError({ code: 'OTHER' }), false);
});

test('UnifiedKnowledgeOracle invokes onAuthChallenge and degrades on OFFLINE_FALLBACK', async () => {
  let challengeInvoked = false;
  const oracle = new UnifiedKnowledgeOracle({
    localMemoryProvider: () => 'Local mock answer'
  });

  const res = await oracle.query('Sample query', {
    onAuthChallenge: async (ctx) => {
      challengeInvoked = true;
      assert.strictEqual(ctx.operation, 'query');
      return 'OFFLINE_FALLBACK';
    }
  });

  assert.strictEqual(challengeInvoked, true);
  assert.strictEqual(res.sourceTier, 'local_ast');
  assert.strictEqual(res.degradedFrom, 'nlm');
});

test('UnifiedKnowledgeOracle throws NotebookLmAuthError when onAuthChallenge returns ABORT', async () => {
  const oracle = new UnifiedKnowledgeOracle({
    localMemoryProvider: () => 'Local mock answer'
  });

  await assert.rejects(
    async () => {
      await oracle.query('Sample query', {
        onAuthChallenge: async () => 'ABORT'
      });
    },
    (err: unknown) => {
      return (
        NotebookLmAuthError.isAuthError(err) &&
        err.message.includes('aborted')
      );
    }
  );
});

test('UnifiedKnowledgeOracle retries tryNotebookLmTier when onAuthChallenge returns REAUTH', async () => {
  let attempts = 0;
  const mockPost = async () => {
    attempts++;
    if (attempts === 1) {
      return { status: 401, text: async () => '', headers: {} };
    }
    return {
      status: 200,
      text: async () => ')]}\'\n\nReauth successful response from NotebookLM oracle with detailed architecture synthesis.',
      headers: {}
    };
  };

  const client = new NotebookLmNativeClient({
    cookies: 'SID=test-sid; HSID=test-hsid; __Secure-1PSIDTS=test-psidts',
    httpPost: mockPost
  });
  const oracle = new UnifiedKnowledgeOracle({ nativeClient: client });

  const res = await oracle.query('Sample query', {
    onAuthChallenge: async () => {
      client.updateCookies('SID=new-sid; HSID=new-hsid; __Secure-1PSIDTS=new-psidts');
      return 'REAUTH';
    }
  });

  assert.strictEqual(res.sourceTier, 'nlm');
  assert.ok(res.answer.includes('Reauth successful response'));
  assert.strictEqual(attempts, 2);
});
