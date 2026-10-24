import { test } from 'node:test';
import * as assert from 'node:assert';
import { DiffEngine } from './diff-engine.js';

test('DiffEngine validates surgical unified diffs and rejects massive changes', () => {
  const engine = new DiffEngine();
  const validDiff = `--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,4 @@\n import { test } from 'node:test';\n+import { extra } from 'node:assert';\n console.log(1);`;
  const res = engine.parseAndValidate(validDiff, 10);
  assert.strictEqual(res.isSurgical, true);
  assert.strictEqual(res.addedLinesCount, 1);

  const massiveDiff = `--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,20 @@\n` + Array.from({ length: 25 }, (_, i) => `+line ${i}`).join('\n');
  const rejected = engine.parseAndValidate(massiveDiff, 10);
  assert.strictEqual(rejected.isSurgical, false);
  assert.ok(rejected.rejectionReason?.includes('exceeding surgical limit'));
});

test('DiffEngine accepts hunk headers with trailing function context', () => {
  const engine = new DiffEngine();
  const diffWithContext = `--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1,5 +1,6 @@ function testFunc() {\n const x = 1;\n+const y = 2;\n return x;`;
  const res = engine.parseAndValidate(diffWithContext, 10);
  assert.strictEqual(res.isSurgical, true);
  assert.strictEqual(res.chunks.length, 1);
  assert.strictEqual(res.chunks[0].oldStart, 1);
  assert.strictEqual(res.chunks[0].newStart, 1);
});

test('DiffEngine correctly handles Windows CRLF diffs with empty context lines', () => {
  const engine = new DiffEngine();
  const crlfDiff = "--- a/src/index.ts\r\n+++ b/src/index.ts\r\n@@ -1,4 +1,5 @@\r\n const a = 1;\r\n\r\n+const b = 2;\r\n return a;\r\n";
  const res = engine.parseAndValidate(crlfDiff, 10);
  assert.strictEqual(res.isSurgical, true);
  assert.strictEqual(res.addedLinesCount, 1);
  assert.strictEqual(res.unmodifiedLinesCount, 3);
  assert.strictEqual(res.chunks.length, 1);
});
