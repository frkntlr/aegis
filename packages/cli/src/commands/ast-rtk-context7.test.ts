import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleAstSearch, handleAstReplace } from './ast-grep-command.js';
import { handleRtkCompress } from './rtk-command.js';
import { handleContext7Query } from './context7-command.js';
import { handleMemoryQuery, getSharedMemoryEngine } from './memory-command.js';

test('handleAstSearch and handleAstReplace execute without error and transform target files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-cmd-test-'));
  const testFile = path.join(tmpDir, 'sample.ts');
  fs.writeFileSync(testFile, 'function add(a, b) { return a + b; }', 'utf8');

  try {
    let output = '';
    const origLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

    try {
      handleAstSearch('function $F($X, $Y) { $$$B }', tmpDir);
      assert.ok(output.includes('Found 1 AST match'));
      assert.ok(output.includes('F="add"'));

      handleAstReplace('function $F($X, $Y) { $$$B }', 'function $F($X: number, $Y: number): number { $$$B }', testFile);
      const updated = fs.readFileSync(testFile, 'utf8');
      assert.ok(updated.includes('function add(a: number, b: number): number'));
    } finally {
      console.log = origLog;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleRtkCompress compresses terminal output from file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-cmd-test-'));
  const logFile = path.join(tmpDir, 'test.log');
  fs.writeFileSync(logFile, '✔ test 1 (1ms)\n✔ test 2 (2ms)\n✖ test 3 (4ms)\n  AssertionError: expected true', 'utf8');

  try {
    let output = '';
    const origLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

    try {
      handleRtkCompress(logFile);
      assert.ok(output.includes('RTK Token Compression'));
      assert.ok(output.includes('2 passing test(s) collapsed'));
      assert.ok(output.includes('✖ test 3'));
    } finally {
      console.log = origLog;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleContext7Query retrieves official library documentation', () => {
  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    handleContext7Query('godot4', 'lifecycle');
    assert.ok(output.includes('Context7 Documentation [GODOT4'));
    assert.ok(output.includes('PackedScene.instantiate()'));
  } finally {
    console.log = origLog;
  }
});

test('handleMemoryQuery injects surgical Ground-Truth without ecosystem bleeding', () => {
  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    const engine = getSharedMemoryEngine();
    const candidates = [
      path.resolve('packages/cli/src/commands/ast-grep-command.ts'),
      path.resolve('src/commands/ast-grep-command.ts')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        engine.indexFile(c, fs.readFileSync(c, 'utf8'));
      }
    }
    handleMemoryQuery('handleAstSearch');
    assert.ok(output.includes('Ground-Truth Engine Documentation (Context7)'));
    assert.ok(output.includes('TYPESCRIPT'));
    assert.ok(!output.includes('GODOT4'));
  } finally {
    console.log = origLog;
  }
});
