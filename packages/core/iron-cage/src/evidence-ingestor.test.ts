import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EvidenceIngestor } from './evidence-ingestor.js';

test('EvidenceIngestor parses JSON test results from Jest/Vitest structure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  const testFile = path.join(tmpDir, 'last-test-run.json');
  const payload = {
    numFailedTests: 2,
    testResults: [{
      name: 'src/core/auth.test.ts',
      assertionResults: [{
        status: 'failed',
        title: 'should reject invalid tokens',
        failureMessages: ['AssertionError: expected 401 to be 200\n    at auth.test.ts:42:10']
      }]
    }]
  };
  fs.writeFileSync(testFile, JSON.stringify(payload), 'utf8');

  const res = EvidenceIngestor.ingestTestResults(testFile);
  assert.strictEqual(res.failingCount, 2);
  assert.strictEqual(res.testFailures.length, 1);
  assert.match(res.testFailures[0], /should reject invalid tokens/);
  assert.match(res.testFailures[0], /AssertionError: expected 401/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('EvidenceIngestor parses plain text test runner failure output', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  const testFile = path.join(tmpDir, 'test-output.txt');
  const text = [
    'PASS src/helper.test.ts',
    'FAIL src/service.test.ts',
    '  ● Service > should connect to database',
    '    Error: Connection timeout after 5000ms',
    '      at service.test.ts:15:9'
  ].join('\n');
  fs.writeFileSync(testFile, text, 'utf8');

  const res = EvidenceIngestor.ingestTestResults(testFile);
  assert.strictEqual(res.failingCount, 1);
  assert.strictEqual(res.testFailures.length, 1);
  assert.match(res.testFailures[0], /FAIL src\/service\.test\.ts/);
  assert.match(res.testFailures[0], /Connection timeout/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('EvidenceIngestor parses Godot crash and runtime logs cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  const logFile = path.join(tmpDir, 'godot_debug.log');
  const logs = [
    'Godot Engine v4.3.stable - https://godotengine.org',
    'SCRIPT ERROR: Parse Error: Identifier "non_existent_var" not declared in current scope.',
    '   at: GDScript::reload (res://scripts/player.gd:42)',
    'Normal debug message from game',
    'ERROR: Condition "!node" is true. Returning: nullptr',
    '   at: get_node (scene/main/node.cpp:150)'
  ].join('\n');
  fs.writeFileSync(logFile, logs, 'utf8');

  const res = EvidenceIngestor.ingestGodotLogs(logFile);
  assert.strictEqual(res.engineErrors.length, 2);
  assert.match(res.engineErrors[0], /SCRIPT ERROR: Parse Error/);
  assert.match(res.engineErrors[0], /player\.gd:42/);
  assert.match(res.engineErrors[1], /Condition "!node" is true/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('EvidenceIngestor handles missing or corrupt files gracefully', () => {
  const resTests = EvidenceIngestor.ingestTestResults('/non/existent/path.json');
  assert.strictEqual(resTests.testFailures.length, 0);
  assert.strictEqual(resTests.failingCount, 0);

  const resGodot = EvidenceIngestor.ingestGodotLogs('/non/existent/godot.log');
  assert.strictEqual(resGodot.engineErrors.length, 0);
});

test('EvidenceIngestor aggregates test failures and godot errors via ingest()', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  const testFile = path.join(tmpDir, 'last-test-run.json');
  const logFile = path.join(tmpDir, 'godot_debug.log');

  fs.writeFileSync(testFile, JSON.stringify({ numFailedTests: 1, failures: ['Test A failed'] }), 'utf8');
  fs.writeFileSync(logFile, 'FATAL: Engine crash on startup', 'utf8');

  const res = EvidenceIngestor.ingest({ testsPath: testFile, godotLogPath: logFile });
  assert.strictEqual(res.failingTestsCount, 1);
  assert.strictEqual(res.testFailures.length, 1);
  assert.strictEqual(res.engineErrors.length, 1);
  assert.strictEqual(res.sources.length, 2);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
