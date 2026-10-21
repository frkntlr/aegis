import { test } from 'node:test';
import * as assert from 'node:assert';
import { TypeScriptSkeletonExtractor } from './ts-extractor.js';
import { PromptCacheManager } from './cache-manager.js';
import { DiffEngine } from './diff-engine.js';

test('TypeScriptSkeletonExtractor omits function bodies and preserves types/classes', () => {
  const extractor = new TypeScriptSkeletonExtractor();
  const sample = `
import { Config } from './config';

export interface User {
  id: string;
  name: string;
}

export type Role = 'admin' | 'user';

export class UserService {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
    console.log('Heavy initialization', this.secret);
  }

  public async getUser(id: string): Promise<User> {
    // 50 lines of complex database queries and logic
    const db = await connect();
    const row = await db.query('SELECT * FROM users WHERE id = ?', id);
    return row;
  }
}

export function calculateMetrics(input: number[]): number {
  let sum = 0;
  for (const n of input) {
    sum += n * 2;
  }
  return sum;
}
  `.trim();

  const result = extractor.extract('service.ts', sample);
  
  // Verify function body was stripped
  assert.ok(!result.skeletonContent.includes('Heavy initialization'));
  assert.ok(!result.skeletonContent.includes('SELECT * FROM users'));
  assert.ok(!result.skeletonContent.includes('sum += n * 2'));

  // Verify signatures and types were preserved
  assert.ok(result.skeletonContent.includes('export interface User'));
  assert.ok(result.skeletonContent.includes('export type Role'));
  assert.ok(result.skeletonContent.includes('class UserService'));
  assert.ok(result.skeletonContent.includes('getUser(id: string): Promise<User>'));
  assert.ok(result.skeletonContent.includes('function calculateMetrics(input: number[]): number'));

  // Verify token savings > 30%
  assert.ok(result.tokenSavingsPercent >= 30, `Expected savings >= 30%, got ${result.tokenSavingsPercent}%`);
});

test('PromptCacheManager splits context into cached blocks', () => {
  const manager = new PromptCacheManager('Test Constitution');
  const context = manager.assembleContext('class A { foo(): void; }', 'Fix bug in foo');

  assert.strictEqual(context.constitutionBlock.cache_control?.type, 'ephemeral');
  assert.strictEqual(context.skeletonMapBlock.cache_control?.type, 'ephemeral');
  assert.strictEqual(context.taskBlock.cache_control, undefined);
  assert.ok(context.cacheRatioPercent > 0);
});

test('DiffEngine validates surgical unified diffs and rejects massive changes', () => {
  const engine = new DiffEngine();
  const validDiff = `
--- a/src/service.ts
+++ b/src/service.ts
@@ -10,3 +10,4 @@
   const a = 1;
+  const b = 2;
   return a;
  `.trim();

  const parsed = engine.parseAndValidate(validDiff, 100);
  assert.strictEqual(parsed.isSurgical, true);
  assert.strictEqual(parsed.addedLinesCount, 1);
  assert.strictEqual(parsed.oldFile, 'src/service.ts');

  // Test rejection of massive diff
  const parsedOversized = engine.parseAndValidate(validDiff, 0); // max 0 allowed
  assert.strictEqual(parsedOversized.isSurgical, false);
  assert.ok(parsedOversized.rejectionReason?.includes('exceeding surgical limit'));
});
