import { test } from 'node:test';
import * as assert from 'node:assert';
import { IdeLauncher } from './ide-launcher.js';

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

test('IdeLauncher detects running IDE processes safely without crashing', () => {
  const launcher = new IdeLauncher();
  const ides = launcher.detectRunningIdes();
  assert.ok(Array.isArray(ides));
});
