import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorktreeMutex, cleanGitEnv, normPath } from './worktree-mutex.js';

test('normPath normalizes backslashes and leading dot-slashes', () => {
  assert.strictEqual(normPath('src\\components\\Button.tsx'), 'src/components/Button.tsx');
  assert.strictEqual(normPath('./src/index.ts'), 'src/index.ts');
  assert.strictEqual(normPath('.\\addons\\bridge.gd'), 'addons/bridge.gd');
});

test('cleanGitEnv clears git directory and index environment variables', () => {
  const origDir = process.env.GIT_DIR;
  process.env.GIT_DIR = 'fake-git-dir';
  const cleaned = cleanGitEnv();
  assert.strictEqual(cleaned.GIT_DIR, undefined);
  assert.strictEqual(cleaned.GIT_TERMINAL_PROMPT, '0');
  if (origDir) process.env.GIT_DIR = origDir;
  else delete process.env.GIT_DIR;
});

test('WorktreeMutex acquires and releases lock directory cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mutex-test-'));
  const lockFilePath = path.join(tmpDir, 'locks.json');
  const lockDir = `${lockFilePath}.lock`;

  const unlock = WorktreeMutex.acquire(lockFilePath);
  assert.strictEqual(fs.existsSync(lockDir), true);
  const pid = fs.readFileSync(path.join(lockDir, 'pid'), 'utf8');
  assert.strictEqual(parseInt(pid, 10), process.pid);

  unlock();
  assert.strictEqual(fs.existsSync(lockDir), false);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
