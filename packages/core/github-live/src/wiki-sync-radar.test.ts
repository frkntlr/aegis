import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { WikiSyncRadar } from './wiki-sync-radar.js';
import { GitHubWikiLiveAdapter } from './wiki-adapter.js';
import { WikiMemoryManager } from './wiki-memory.js';
import { cleanGitEnv } from './wiki-helpers.js';

function setupTempGitRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-radar-test-'));
  const env = cleanGitEnv();
  execFileSync('git', ['init', '-b', 'master', tmpDir], { stdio: 'pipe', env });
  execFileSync('git', ['-C', tmpDir, 'config', 'user.name', 'Aegis Test'], { stdio: 'pipe', env });
  execFileSync('git', ['-C', tmpDir, 'config', 'user.email', 'test@aegis.local'], { stdio: 'pipe', env });
  return tmpDir;
}

test('WikiSyncRadar detects local dirty files and stages/commits them', () => {
  const tmpDir = setupTempGitRepo();
  try {
    assert.strictEqual(WikiSyncRadar.isLocalDirty(tmpDir), false);

    fs.writeFileSync(path.join(tmpDir, 'Architecture.md'), '# Architecture\n• Rule A\n', 'utf8');
    assert.strictEqual(WikiSyncRadar.isLocalDirty(tmpDir), true);

    const committed = WikiSyncRadar.stageAndCommitDirty(tmpDir, 'docs: initial test commit');
    assert.strictEqual(committed, true);
    assert.strictEqual(WikiSyncRadar.isLocalDirty(tmpDir), false);

    const sha = WikiSyncRadar.getHeadSha(tmpDir);
    assert.strictEqual(sha.length, 40);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WikiSyncRadar tracks ahead divergence on local-only commits', () => {
  const tmpDir = setupTempGitRepo();
  try {
    fs.writeFileSync(path.join(tmpDir, 'Page1.md'), '# Page 1\n• Content\n', 'utf8');
    WikiSyncRadar.stageAndCommitDirty(tmpDir, 'first');
    fs.writeFileSync(path.join(tmpDir, 'Page2.md'), '# Page 2\n• Content\n', 'utf8');
    WikiSyncRadar.stageAndCommitDirty(tmpDir, 'second');

    const div = WikiSyncRadar.getCommitDivergence(tmpDir);
    assert.strictEqual(div.ahead, 2);
    assert.strictEqual(div.behind, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WikiSyncRadar reads, writes and validates TTL manifest', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-manifest-test-'));
  const manifestPath = path.join(tmpDir, 'wiki-sync-state.json');
  try {
    assert.strictEqual(WikiSyncRadar.readSyncManifest(manifestPath), null);

    const now = Date.now();
    WikiSyncRadar.writeSyncManifest(manifestPath, {
      lastSyncTimestamp: now,
      remoteRepo: 'frkntlr/aegis.wiki.git',
      headSha: 'abc1234567890abcdef1234567890abcdef1234',
      lastStatus: 'clean'
    });

    const loaded = WikiSyncRadar.readSyncManifest(manifestPath);
    assert.ok(loaded);
    assert.strictEqual(loaded.remoteRepo, 'frkntlr/aegis.wiki.git');
    assert.strictEqual(WikiSyncRadar.isTtlValid(loaded, 60_000), true);
    assert.strictEqual(WikiSyncRadar.isTtlValid(loaded, -1), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fastSync honors TTL manifest and returns cached in sub-second with 0 network calls', () => {
  const tmpDir = setupTempGitRepo();
  const manifestPath = path.join(path.dirname(tmpDir), 'wiki-sync-state.json');
  try {
    fs.writeFileSync(path.join(tmpDir, 'Page.md'), '# Fast Page\n• Bullet\n', 'utf8');
    WikiSyncRadar.stageAndCommitDirty(tmpDir, 'initial page');
    const sha = WikiSyncRadar.getHeadSha(tmpDir);

    WikiSyncRadar.writeSyncManifest(manifestPath, {
      lastSyncTimestamp: Date.now(),
      remoteRepo: 'frkntlr/aegis.wiki.git',
      headSha: sha,
      lastStatus: 'clean'
    });

    const adapter = new GitHubWikiLiveAdapter({ localCloneDir: tmpDir });
    const res = adapter.fastSync({ ttlMs: 30_000 });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.cached, true);
    assert.strictEqual(res.pulled, false);
    assert.strictEqual(res.pushed, false);
    assert.ok(res.durationMs < 250, `Expected duration < 250ms, got ${res.durationMs}ms`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
  }
});

test('pushAllToRemote skips push when remote already up-to-date and working copy clean', () => {
  const tmpDir = setupTempGitRepo();
  try {
    const adapter = new GitHubWikiLiveAdapter({ localCloneDir: tmpDir });
    const res = adapter.pushAllToRemote();
    assert.strictEqual(res.success, true);
    assert.ok(res.message.includes('already up-to-date'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WikiMemoryManager.fastSync integrates seamless cache acceleration', () => {
  const tmpDir = setupTempGitRepo();
  const manifestPath = path.join(path.dirname(tmpDir), 'wiki-sync-state.json');
  try {
    fs.writeFileSync(path.join(tmpDir, 'Architecture.md'), '# Arch\n• B1\n• B2\n• B3\n', 'utf8');
    WikiSyncRadar.stageAndCommitDirty(tmpDir, 'seed');
    const sha = WikiSyncRadar.getHeadSha(tmpDir);

    WikiSyncRadar.writeSyncManifest(manifestPath, {
      lastSyncTimestamp: Date.now(),
      remoteRepo: 'frkntlr/aegis.wiki.git',
      headSha: sha,
      lastStatus: 'clean'
    });

    const manager = new WikiMemoryManager(tmpDir);
    const result = manager.fastSync({ ttlMs: 60_000 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.cached, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
  }
});
