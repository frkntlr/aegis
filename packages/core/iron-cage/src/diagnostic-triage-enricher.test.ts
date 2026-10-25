import { test } from 'node:test';
import * as assert from 'node:assert';
import { DiagnosticTriageEnricher } from './diagnostic-triage-enricher.js';
import { EvidenceBasedTriageGate } from './triage-gate.js';

test('DiagnosticTriageEnricher strips ANSI sequences and filters internal stacks (#200, #204)', () => {
  const rawWithAnsi = '\x1b[31mError: Boom\x1b[39m\n    at Object.<anonymous> (/app/src/index.ts:15:3)\n    at Module._compile (node:internal/modules/cjs/loader:123:14)\n    at node_modules/vitest/dist/index.js:50:12';
  const clean = DiagnosticTriageEnricher.stripAnsi(rawWithAnsi);
  assert.ok(!clean.includes('\x1b'));

  const filtered = DiagnosticTriageEnricher.filterStackFrames(rawWithAnsi);
  assert.ok(filtered.includes('/app/src/index.ts:15:3'));
  assert.ok(!filtered.includes('node:internal'));
  assert.ok(!filtered.includes('node_modules'));
});

test('DiagnosticTriageEnricher extracts precise location from Jest and Vitest (#199)', () => {
  const vitestLine = '❯ packages/core/src/parser.ts:42:15';
  const vitestLoc = DiagnosticTriageEnricher.extractLocation(vitestLine);
  assert.strictEqual(vitestLoc.filePath, 'packages/core/src/parser.ts');
  assert.strictEqual(vitestLoc.line, 42);

  const jestLine = '    at runTest (packages/cli/src/main.ts:88:5)';
  const jestLoc = DiagnosticTriageEnricher.extractLocation(jestLine);
  assert.strictEqual(jestLoc.filePath, 'packages/cli/src/main.ts');
  assert.strictEqual(jestLoc.line, 88);
});

test('DiagnosticTriageEnricher attributes Turbo package prefix (#202)', () => {
  const turboLog = '@aegis/ast-skeleton:test: ✖ failed assertion at src/index.ts:10:2';
  const attributed = DiagnosticTriageEnricher.attributeTurboPackage(turboLog);
  assert.strictEqual(attributed.packageScope, '@aegis/ast-skeleton');
  assert.ok(attributed.cleanText.includes('failed assertion'));
});

test('DiagnosticTriageEnricher classifies Godot errors correctly (#203)', () => {
  const parseErr = DiagnosticTriageEnricher.classify('SCRIPT ERROR: Parse Error: Unexpected token at res://scripts/player.gd:12');
  assert.strictEqual(parseErr.category, 'GODOT_PARSE_ERROR');

  const runtimeErr = DiagnosticTriageEnricher.classify('SCRIPT ERROR: Invalid get index "health" on base "Nil"');
  assert.strictEqual(runtimeErr.category, 'GODOT_RUNTIME_ERROR');
});

test('DiagnosticTriageEnricher classifies syntax vs type errors and attaches Context7 advice (#198, #207)', () => {
  const syntax = DiagnosticTriageEnricher.classify('src/main.ts:10:2 - error TS1005: ";" expected.');
  assert.strictEqual(syntax.category, 'SYNTAX_ERROR');

  const typeErr = DiagnosticTriageEnricher.classify("src/main.ts:15:5 - error TS2304: Cannot find name 'UndefinedSymbol'");
  assert.strictEqual(typeErr.category, 'TYPE_ERROR');
  assert.ok(typeErr.remediation?.includes('Context7'));
});

test('DiagnosticTriageEnricher detects circular dependencies and merge conflicts (#205, #206)', () => {
  const circular = DiagnosticTriageEnricher.classify("TypeError: Cannot read properties of undefined (reading 'prototype')");
  assert.strictEqual(circular.category, 'CIRCULAR_DEPENDENCY');

  const conflict = DiagnosticTriageEnricher.classify('<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch');
  assert.strictEqual(conflict.category, 'MERGE_CONFLICT');
});

test('EvidenceBasedTriageGate enriches findings via DiagnosticTriageEnricher', () => {
  const gate = new EvidenceBasedTriageGate();
  const report = gate.evaluate({
    targetFiles: ['src/index.ts'],
    testFailures: ['@aegis/core:test: ❯ src/index.ts:25:4\nTypeError: Cannot find name TS2304']
  });

  assert.strictEqual(report.criticalCount, 1);
  const finding = report.findings[0];
  assert.strictEqual(finding.filePath, 'src/index.ts');
  assert.strictEqual(finding.line, 25);
  assert.strictEqual(finding.defectType, 'TYPE_ERROR');
  assert.ok(finding.remediation?.includes('Context7'));
});
