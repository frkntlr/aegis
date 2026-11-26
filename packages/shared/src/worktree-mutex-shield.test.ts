import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorktreeMutexShield } from './worktree-mutex-shield.js';

function withLockRepo(locksJson: Buffer | string, fn: (root: string) => void): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mutex-shield-'));
  try {
    fs.mkdirSync(path.join(tmpDir, '.aegis'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.aegis', 'locks.json'), locksJson);
    fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('WorktreeMutexShield.normalizeLockPath strips worktree prefix and normalizes slashes', () => {
  assert.equal(
    WorktreeMutexShield.normalizeLockPath('experimental\\solver\\src\\Index.ts'),
    'src/index.ts'
  );
  assert.equal(WorktreeMutexShield.normalizeLockPath('./packages/shared/src/a.ts'), 'packages/shared/src/a.ts');
});

test('WorktreeMutexShield.isPidAlive handles invalid, alive, and dead PIDs', () => {
  assert.equal(WorktreeMutexShield.isPidAlive(0), false);
  assert.equal(WorktreeMutexShield.isPidAlive(-10), false);
  assert.equal(WorktreeMutexShield.isPidAlive(process.pid), true);
  assert.equal(WorktreeMutexShield.isPidAlive(9999999), false);
});

test('WorktreeMutexShield.inspectLock detects active other-agent lock in BOM locks.json', () => {
  const json = JSON.stringify({
    'packages/shared/src/json-safe.ts': { agent: 'qa-hunter', pid: process.pid, lockId: 'L-42' }
  });
  const bomPayload = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json, 'utf8')]);
  withLockRepo(bomPayload, (root) => {
    const info = WorktreeMutexShield.inspectLock('packages/shared/src/json-safe.ts', 'issue-solver', root);
    assert.ok(info);
    assert.equal(info.lockedBy, 'qa-hunter');
    assert.equal(info.lockId, 'L-42');
    assert.equal(info.isLockedByOther, true);
    assert.match(info.warning ?? '', /qa-hunter/);
  });
});

test('WorktreeMutexShield.inspectLock recognizes self-locks and skips dead-PID locks', () => {
  const json = JSON.stringify({
    'src/self.ts': { agent: 'aegis/solver', pid: process.pid },
    'src/stale.ts': { agent: 'other-agent', pid: 9999999 }
  });
  withLockRepo(json, (root) => {
    const selfInfo = WorktreeMutexShield.inspectLock('src/self.ts', 'solver', root);
    assert.ok(selfInfo);
    assert.equal(selfInfo.isLockedByOther, false);
    assert.equal(selfInfo.warning, undefined);
    assert.equal(WorktreeMutexShield.inspectLock('src/stale.ts', 'solver', root), null);
  });
});

test('WorktreeMutexShield.inspectLock logs corrupt locks.json when AEGIS_DEBUG=1 and returns null', () => {
  withLockRepo('{corrupt', (root) => {
    const prevDebug = process.env.AEGIS_DEBUG;
    const origWrite = process.stderr.write.bind(process.stderr);
    const logs: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      process.env.AEGIS_DEBUG = '1';
      assert.equal(WorktreeMutexShield.inspectLock('src/a.ts', 'solver', root), null);
      assert.equal(logs.some((l) => l.includes('[aegis:worktree-mutex-shield]')), true);
    } finally {
      process.stderr.write = origWrite;
      if (prevDebug === undefined) delete process.env.AEGIS_DEBUG;
      else process.env.AEGIS_DEBUG = prevDebug;
    }
  });
});
