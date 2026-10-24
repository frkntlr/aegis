import { test } from 'node:test';
import * as assert from 'node:assert';
import { RfcTriager } from './rfc-triager.js';

test('RfcTriager accurately parses language RFC discussions and derives criteria', () => {
  const triager = new RfcTriager();
  const title = 'RFC: [Extension] Add Kotlin AST Extractor';
  const body = 'Kotlin developers need AST skeleton extraction to reduce prompt token consumption.\nTarget: packages/core/ast-skeleton/src/kotlin-extractor.ts';

  const parsed = triager.parseRfc(title, body, 42);
  assert.strictEqual(parsed.category, 'language');
  assert.strictEqual(parsed.targetName, 'Kotlin');
  assert.strictEqual(parsed.discussionNumber, 42);
  assert.ok(parsed.proposedFiles.includes('packages/core/ast-skeleton/src/kotlin-extractor.ts'));

  const criteria = triager.generateAcceptanceCriteria(parsed);
  assert.ok(criteria.some(c => c.includes('LanguageExtractor interface')));
  assert.ok(criteria.some(c => c.includes('Demir Kafes 100% compliance')));
});

test('RfcTriager converts approved RFC into actionable GitHubIssue', () => {
  const triager = new RfcTriager();
  const parsed = triager.parseRfc('RFC: [Extension] Add Zed Editor Support', 'Integrate Zed editor workspace settings', 88);

  const issue = triager.convertToIssue(parsed, 105);
  assert.strictEqual(issue.number, 105);
  assert.strictEqual(issue.status, 'ready');
  assert.ok(issue.labels.includes('status:ready'));
  assert.ok(issue.labels.includes('rfc:approved'));
  assert.ok(issue.labels.some(l => l.startsWith('lock:')));
  assert.strictEqual(issue.acceptanceCriteria.length >= 3, true);
});

test('RfcTriager parses support and compound language names', () => {
  const triager = new RfcTriager();
  const parsed = triager.parseRfc('RFC: Support Godot C# AST skeletons', 'We need C# roslyn AST parser in skeleton extractor', 99);
  assert.strictEqual(parsed.category, 'language');
  assert.strictEqual(parsed.targetName, 'Godot C#');
  assert.ok(parsed.proposedFiles[0].includes('godotc'));
});


test('RfcTriager handles undefined or empty body and special character names safely', () => {
  const triager = new RfcTriager();
  const parsed = triager.parseRfc('RFC: ###!!!', undefined, 12);
  assert.strictEqual(parsed.category, 'language');
  assert.ok(parsed.proposedFiles.length > 0);
  assert.ok(!parsed.proposedFiles[0].includes('//'));
});
