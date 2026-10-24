import { test } from 'node:test';
import * as assert from 'node:assert';
import { RoleClassifier } from './role-classifier.js';

test('RoleClassifier identifies solver role from bug labels and code files', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Fix null pointer error in compiler',
    labels: ['bug', 'high-priority'],
    targetFiles: ['src/compiler.ts', 'src/lexer.ts']
  });

  assert.strictEqual(res.role, 'solver');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
  assert.ok(res.reason.includes('Kod Çözümü'));
});

test('RoleClassifier identifies qa role from test files and ui labels', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Inspect layout overflow on mobile viewport',
    labels: ['qa', 'ui'],
    targetFiles: ['src/Header.test.ts', 'scenes/Main.tscn']
  });

  assert.strictEqual(res.role, 'qa');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
  assert.ok(res.reason.includes('Test & Arayüz'));
});

test('RoleClassifier identifies docs role from markdown files and doc keywords', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Update Living Architecture Guide',
    labels: ['docs'],
    targetFiles: ['wiki/Architecture.md', 'docs/README.md']
  });

  assert.strictEqual(res.role, 'docs');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
  assert.ok(res.reason.includes('Dokümantasyon'));
});

test('RoleClassifier flags low confidence when signals are empty or ambiguous', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Misc cleanup',
    labels: [],
    targetFiles: []
  });

  assert.strictEqual(res.isAmbiguous, true);
  assert.ok(res.confidence < 60);
});

test('RoleClassifier normalizes Windows path separators in target files', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Update Living Architecture Guide',
    labels: ['docs'],
    targetFiles: ['wiki\\Architecture.md', 'docs\\README.md']
  });

  assert.strictEqual(res.role, 'docs');
  assert.ok(res.confidence >= 60);
});
