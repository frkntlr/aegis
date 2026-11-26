import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IdeLauncher, resolveWindowsBinary } from './ide-launcher.js';

test('IdeLauncher resolves launch commands and handles focusFile', () => {
  const launcher = new IdeLauncher();
  const cmdCursor = launcher.buildLaunchCommand({
    ideType: 'Cursor AI',
    worktreePath: 'worktrees/alice',
    focusFile: 'src/main.ts'
  });
  assert.ok(cmdCursor.includes('cursor'));
  assert.ok(cmdCursor.includes('worktrees'));
  assert.ok(cmdCursor.includes('src/main.ts') || cmdCursor.includes('src\\main.ts'));

  const cmdVsCode = launcher.buildLaunchCommand({
    ideType: 'VS Code',
    worktreePath: 'worktrees/bob'
  });
  assert.ok(cmdVsCode.includes('code'));
  assert.ok(cmdVsCode.includes('bob'));
});

test('IdeLauncher rejects control chars, option flags, and escaping focusFile', () => {
  const launcher = new IdeLauncher();
  assert.throws(() => launcher.buildLaunchCommand({ ideType: 'VS Code', worktreePath: 'worktrees/a\nwhoami' }), /Invalid worktreePath/);
  assert.throws(() => launcher.buildLaunchCommand({ ideType: 'VS Code', worktreePath: 'worktrees/a\0b' }), /Invalid worktreePath/);

  const badFocus = launcher.launchIde({ ideType: 'VS Code', worktreePath: 'worktrees/a', focusFile: '--goto' });
  assert.strictEqual(badFocus.success, false);
  assert.ok(badFocus.message.includes('Invalid focusFile'));

  const escaped = launcher.launchIde({ ideType: 'VS Code', worktreePath: 'worktrees/a', focusFile: '../../secret.txt' });
  assert.strictEqual(escaped.success, false);
  assert.ok(escaped.message.includes('escapes worktreePath'));
});

test('IdeLauncher resolves Windows binaries and launches safely without shell injection', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ide-launch-'));
  try {
    const marker = path.join(tmpDir, 'pwned.txt');
    const batPath = path.join(tmpDir, 'mock-ide.cmd');
    fs.writeFileSync(batPath, '@echo off\r\nexit /b 0\r\n', 'utf8');

    const wtDir = path.join(tmpDir, 'wt & dir');
    fs.mkdirSync(wtDir, { recursive: true });
    fs.writeFileSync(path.join(wtDir, 'main.ts'), 'export {};\n', 'utf8');

    if (process.platform === 'win32') {
      const noExt = path.join(tmpDir, 'mock-ide');
      fs.writeFileSync(noExt, '#!/bin/sh\n', 'utf8');
      assert.strictEqual(resolveWindowsBinary(noExt).toLowerCase(), batPath.toLowerCase());
    }

    const launcher = new IdeLauncher({ 'vs code': batPath });
    const res = launcher.launchIde({ ideType: 'VS Code', worktreePath: wtDir, focusFile: 'main.ts' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('IdeLauncher detects running IDE processes safely without crashing', () => {
  const launcher = new IdeLauncher();
  const ides = launcher.detectRunningIdes();
  assert.ok(Array.isArray(ides));
});
