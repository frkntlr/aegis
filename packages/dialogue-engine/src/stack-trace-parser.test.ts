import { test } from 'node:test';
import assert from 'node:assert';
import { PolyglotStackTraceParser, stripAnsi } from './stack-trace-parser.js';

test('PolyglotStackTraceParser parses Node.js V8 stack trace', () => {
  const trace = `Error: Something failed
    at Watchdog.resetTimer (C:/Users/Lenovo/work/aegis/packages/core/watchdog.ts:42:15)
    at Object.<anonymous> (C:/Users/Lenovo/work/aegis/packages/cli/main.ts:100:5)`;

  const parser = new PolyglotStackTraceParser();
  const res = parser.parse(trace);

  assert.ok(res.primaryLocation);
  assert.strictEqual(res.primaryLocation.symbolName, 'Watchdog.resetTimer');
  assert.strictEqual(res.primaryLocation.filePath, 'C:/Users/Lenovo/work/aegis/packages/core/watchdog.ts');
  assert.strictEqual(res.primaryLocation.lineNumber, 42);
  assert.strictEqual(res.primaryLocation.columnNumber, 15);
  assert.strictEqual(res.primaryLocation.format, 'node_v8');
  assert.strictEqual(res.confidenceScore, 1.0);
  assert.strictEqual(res.needsClarification, false);
});

test('PolyglotStackTraceParser parses Godot res:// error log', () => {
  const godotLog = `SCRIPT ERROR: Parse Error: Function invalid.
          At: res://scripts/player_controller.gd:58`;

  const parser = new PolyglotStackTraceParser();
  const res = parser.parse(godotLog);

  assert.ok(res.primaryLocation);
  assert.strictEqual(res.primaryLocation.filePath, 'scripts/player_controller.gd');
  assert.strictEqual(res.primaryLocation.lineNumber, 58);
  assert.strictEqual(res.primaryLocation.format, 'godot_res');
  assert.ok(res.confidenceScore >= 0.90);
  assert.strictEqual(res.needsClarification, false);
});

test('PolyglotStackTraceParser parses generic POSIX error line', () => {
  const posixLog = `FAIL src/auth/token-validator.ts:89:12: Token expired error`;
  const parser = new PolyglotStackTraceParser();
  const res = parser.parse(posixLog);

  assert.ok(res.primaryLocation);
  assert.strictEqual(res.primaryLocation.filePath, 'src/auth/token-validator.ts');
  assert.strictEqual(res.primaryLocation.lineNumber, 89);
  assert.strictEqual(res.primaryLocation.columnNumber, 12);
  assert.strictEqual(res.primaryLocation.format, 'generic_posix');
});

test('PolyglotStackTraceParser skips node:internal frames', () => {
  const trace = `Error: Internal fail
    at Module._compile (node:internal/modules/cjs/loader:1546:14)
    at executeTask (packages/core/task-runner.ts:25:3)`;

  const parser = new PolyglotStackTraceParser();
  const res = parser.parse(trace);

  assert.ok(res.primaryLocation);
  assert.strictEqual(res.primaryLocation.filePath, 'packages/core/task-runner.ts');
  assert.strictEqual(res.primaryLocation.lineNumber, 25);
});

test('PolyglotStackTraceParser handles unparseable log with low confidence fallback', () => {
  const randomText = 'Some arbitrary warning message without file and line info';
  const parser = new PolyglotStackTraceParser();
  const res = parser.parse(randomText);

  assert.strictEqual(res.primaryLocation, undefined);
  assert.strictEqual(res.confidenceScore, 0.0);
  assert.strictEqual(res.needsClarification, true);
});

test('PolyglotStackTraceParser strips ANSI escape codes and implements parseEvidence', async () => {
  const ansiTrace = `\u001b[31mError:\u001b[39m at runJob (src/job.ts:14:2)`;
  assert.strictEqual(stripAnsi(ansiTrace), 'Error: at runJob (src/job.ts:14:2)');

  const parser = new PolyglotStackTraceParser();
  const evidence = await parser.parseEvidence(ansiTrace);

  assert.strictEqual(evidence.filePath, 'src/job.ts');
  assert.strictEqual(evidence.lineNumber, 14);
  assert.strictEqual(evidence.symbolName, 'runJob');
  assert.strictEqual(evidence.needsClarification, false);
});
