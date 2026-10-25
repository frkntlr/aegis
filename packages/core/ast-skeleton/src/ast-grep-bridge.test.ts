import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AstGrepBridge, type AstGrepRule } from './ast-grep-bridge.js';

test('AstGrepBridge finds structural patterns with single and multi metavariables', () => {
  const tsCode = `
function calculate(x, y) {
  return x + y;
}
function multiply(a, b) {
  return a * b;
}
`.trim();

  const matches = AstGrepBridge.find(tsCode, 'function $NAME($PARAM1, $PARAM2) { $$$BODY }');
  assert.strictEqual(matches.length, 2);
  assert.strictEqual(matches[0].metavars['NAME'], 'calculate');
  assert.strictEqual(matches[0].metavars['PARAM1'], 'x');
  assert.strictEqual(matches[0].metavars['PARAM2'], 'y');
  assert.ok(matches[0].metavars['BODY'].includes('return x + y;'));

  assert.strictEqual(matches[1].metavars['NAME'], 'multiply');
});

test('AstGrepBridge replaces structural patterns cleanly', () => {
  const gdCode = `
func old_init(param):
    print(param)
`.trim();

  const result = AstGrepBridge.replace(gdCode, 'func old_init($ARG):', 'func _init($ARG) -> void:');
  assert.strictEqual(result.hasChanges, true);
  assert.strictEqual(result.matchCount, 1);
  assert.ok(result.transformed.includes('func _init(param) -> void:'));
});

test('AstGrepBridge lints content against AST rules', () => {
  const code = `
const a = eval("2 + 2");
const b = eval("3 + 3");
const c = ok();
`.trim();

  const rules: AstGrepRule[] = [
    {
      id: 'NO_EVAL',
      pattern: 'eval($ARG)',
      message: 'eval() is forbidden under Demir Kafes security policy.',
      severity: 'error'
    }
  ];

  const violations = AstGrepBridge.lint(code, rules);
  assert.strictEqual(violations.length, 2);
  assert.strictEqual(violations[0].ruleId, 'NO_EVAL');
  assert.strictEqual(violations[0].severity, 'error');
});

test('AstGrepBridge replaceInFile updates file content on disk when patterns match', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-grep-replace-'));
  const target = path.join(tmpDir, 'mod.ts');
  fs.writeFileSync(target, 'const value = calculate(1, 2);', 'utf8');

  try {
    const res = AstGrepBridge.replaceInFile(target, 'calculate($A, $B)', 'compute($A, $B)');
    assert.strictEqual(res.written, true);
    assert.strictEqual(res.matchCount, 1);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'const value = compute(1, 2);');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AstGrepBridge searchDirectory scans files and returns matching paths', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-grep-test-'));
  const file1 = path.join(tmpDir, 'service.ts');
  fs.writeFileSync(file1, 'function helper(data) { return data; }', 'utf8');

  try {
    const results = AstGrepBridge.searchDirectory(tmpDir, 'function $F($X) { $$$BODY }');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].metavars['F'], 'helper');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
