import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import childProcess from 'node:child_process';
import { GitHubWikiLiveAdapter } from './wiki-adapter.js';
import { parseWikiMarkdown } from './wiki-helpers.js';
import { WikiMemoryManager } from './wiki-memory.js';

test('unchanged wiki snapshots avoid writes and git commits while push remains explicit', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-evidence-'));
  try {
    const adapter = new GitHubWikiLiveAdapter({ localCloneDir: root });
    const bullets: [string, string, string] = ['Source snapshot', 'Status: Proposed', 'Tests not run'];
    assert.equal(adapter.publishPage('proposal', 'Proposal', bullets, 'Source body'), true);
    const file = path.join(root, 'proposal.md');
    fs.utimesSync(file, new Date(1000), new Date(1000));
    fs.mkdirSync(path.join(root, '.git'));
    const git = t.mock.method(childProcess, 'execFileSync', () => Buffer.from(''));
    assert.equal(adapter.publishPage('proposal', 'Proposal', bullets, 'Source body'), true);
    assert.equal(fs.statSync(file).mtimeMs, 1000);
    assert.equal(git.mock.callCount(), 0);
    assert.equal(adapter.publishPage('proposal', 'Proposal', bullets, 'Source body', true), true);
    assert.equal(git.mock.callCount(), 1);
    assert.ok(git.mock.calls[0].arguments[1]?.includes('push'));
    assert.match(fs.readFileSync(file, 'utf8'), /Cached locally on:/);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Published to GitHub/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('remote failures and missing wiki metadata never imply availability or passing quality gates', t => {
  t.mock.method(childProcess, 'execFileSync', () => { throw new Error('Access denied'); });
  const status = new GitHubWikiLiveAdapter().checkRemoteAvailability();
  assert.equal(status.available, false);
  assert.match(status.message ?? '', /could not be confirmed/);
  const page = parseWikiMarkdown('unknown', '# Unknown\nNo evidence supplied');
  assert.doesNotMatch(page.threeBulletSummary.join('\n'), /compliance verified/);
});

test('a failed page write cannot become an in-memory success', t => {
  t.mock.method(GitHubWikiLiveAdapter.prototype, 'publishPage', () => false);
  const manager = new WikiMemoryManager();
  assert.throws(() => manager.setPage('unwritten', 'Unwritten', ['A', 'B', 'C']), /could not be persisted/);
  assert.ok(!manager.listPages().some(page => page.slug === 'unwritten'));
});
