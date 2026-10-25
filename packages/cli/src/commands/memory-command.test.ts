import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  handleMemoryQuery,
  handleMemoryStats,
  handleMemoryRefresh,
  handleMemoryWatch,
  getSharedMemoryEngine
} from './memory-command.js';

test('handleMemoryQuery: queries memory and handles non-existent or existing symbol', () => {
  const engine = getSharedMemoryEngine();
  engine.indexFile('test/dummy.ts', 'export class DummyService { public run(): void {} }');

  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    handleMemoryQuery('DummyService');
    assert.ok(output.includes('Codebase Memory: \'DummyService\''));
    assert.ok(output.includes('Demir Kafes Guardrails'));

    output = '';
    handleMemoryQuery('NonExistentSymbol123');
    assert.ok(output.includes('Symbol \'NonExistentSymbol123\' not found'));
  } finally {
    console.log = origLog;
  }
});

test('handleMemoryStats and handleMemoryRefresh execute cleanly', () => {
  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    handleMemoryStats('default');
    assert.ok(output.includes('Codebase Memory Diagnostics'));
    assert.ok(output.includes('Indexed Files:'));

    output = '';
    handleMemoryRefresh('packages/core/ast-skeleton', 'default');
    assert.ok(output.includes('Memory Refreshed in'));
  } finally {
    console.log = origLog;
  }
});

test('handleMemoryWatch initializes watcher on target directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cli-watch-'));
  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };
  let watcher: ReturnType<typeof handleMemoryWatch> = null;

  try {
    watcher = handleMemoryWatch(tmpDir, 'cli-watch-test');
    assert.ok(output.includes('Live Codebase Memory Watcher active'));
  } finally {
    if (watcher) watcher.stop();
    console.log = origLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
