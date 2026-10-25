import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorktreeMutex, WorktreeMutexShield, cleanGitEnv, normPath } from './worktree-mutex.js';

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

test('WorktreeMutexShield: returns null when .aegis/locks.json does not exist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-shield-null-'));
  try {
    const lock = WorktreeMutexShield.inspectLock('src/player.gd', 'solver', tmpDir);
    assert.strictEqual(lock, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WorktreeMutexShield: flags files locked by other agents and produces warning', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-shield-test-'));
  const aegisDir = path.join(tmpDir, '.aegis');
  fs.mkdirSync(aegisDir, { recursive: true });

  const locksData = {
    'src/player.gd': { agent: 'aegis/qa', lockId: 'lk_9821' },
    'src/enemy.gd': 'solver'
  };
  fs.writeFileSync(path.join(aegisDir, 'locks.json'), JSON.stringify(locksData), 'utf8');

  try {
    const playerLock = WorktreeMutexShield.inspectLock('src/player.gd', 'solver', tmpDir);
    assert.ok(playerLock !== null);
    assert.strictEqual(playerLock.isLockedByOther, true);
    assert.strictEqual(playerLock.lockedBy, 'aegis/qa');
    assert.strictEqual(playerLock.lockId, 'lk_9821');
    assert.ok(playerLock.warning?.includes("Bu dosya şu anda 'aegis/qa' ajanı tarafından kilitlenmiştir (Lock ID: lk_9821)"));
    assert.ok(playerLock.warning?.includes('Paralel yazma çakışmaya yol açacaktır'));

    const enemyLock = WorktreeMutexShield.inspectLock('src/enemy.gd', 'solver', tmpDir);
    assert.ok(enemyLock !== null);
    assert.strictEqual(enemyLock.isLockedByOther, false);
    assert.strictEqual(enemyLock.warning, undefined);

    const freeLock = WorktreeMutexShield.inspectLock('src/unlocked.gd', 'solver', tmpDir);
    assert.strictEqual(freeLock, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
