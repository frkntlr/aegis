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
  handleMemoryColdStart,
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

test('handleMemoryQuery: prints worktree header, mutex lock status, and line budget', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cli-lock-'));
  const prevCwd = process.cwd();
  process.chdir(tmpDir);

  const aegisDir = path.join(tmpDir, '.aegis');
  fs.mkdirSync(aegisDir, { recursive: true });
  fs.writeFileSync(path.join(aegisDir, 'locks.json'), JSON.stringify({
    'src/locked.ts': { agent: 'aegis/qa', lockId: 'lk_cli_test' }
  }), 'utf8');

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'locked.ts'), 'export class LockedModule { execute(): void {} }', 'utf8');

  const engine = getSharedMemoryEngine();
  engine.indexFile('src/locked.ts', 'export class LockedModule { execute(): void {} }', 'solver');

  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    handleMemoryQuery('execute', 'solver');
    assert.ok(output.includes('Worktree: solver'), 'must print worktree name');
    assert.ok(output.includes('Demir Kafes Line Budget'), 'must print line budget');
    assert.ok(output.includes('Quota:'), 'must print line quota');
    assert.ok(output.includes("LOCKED by 'aegis/qa'"), 'must display active lock warning');
  } finally {
    console.log = origLog;
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleMemoryColdStart executes cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cli-cold-'));
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'cold_sample.ts'), 'export const val = 42;');

  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    await handleMemoryColdStart(tmpDir, 'cold-wt-test');
    assert.ok(output.includes('Cold-Start Indexing Complete'));
    assert.ok(output.includes('Scanned Files: 1'));
  } finally {
    console.log = origLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
