import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import childProcess from 'node:child_process';
import { GitHubWikiLiveAdapter } from './wiki-adapter.js';
import { buildGitAuthEnv, isPathInsideDir, redactGitToken } from './wiki-helpers.js';
import { executeFastReconcile } from './wiki-sync-radar.js';

test('getWikiRemoteUrl never embeds tokens and seedComprehensiveWikiSuite keeps .git/config clean', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-sec-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const secretToken = 'ghp_secretTokenValue123456';
  const adapter = new GitHubWikiLiveAdapter({
    token: secretToken,
    owner: 'frkntlr',
    repo: 'aegis',
    localCloneDir: root
  });
  assert.equal(adapter.getWikiRemoteUrl(), 'https://github.com/frkntlr/aegis.wiki.git');
  adapter.seedComprehensiveWikiSuite();
  const gitConfig = fs.readFileSync(path.join(root, '.git', 'config'), 'utf8');
  assert.equal(gitConfig.includes(secretToken), false);
  assert.equal(gitConfig.includes('x-access-token'), false);
});

test('buildGitAuthEnv configures ephemeral GIT_CONFIG_COUNT extraheader and redactGitToken scrubs secrets', () => {
  const secret = 'ghp_ephemeralToken987';
  const env = buildGitAuthEnv(secret, { PATH: process.env.PATH || '' });
  assert.equal(env.GIT_CONFIG_COUNT, '1');
  assert.equal(env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.ok(env.GIT_CONFIG_VALUE_0?.startsWith('AUTHORIZATION: basic '));
  const rawErr = `fatal: https://x-access-token:${secret}@github.com/org/repo.wiki.git AUTHORIZATION: basic YWJj`;
  const redacted = redactGitToken(rawErr, secret);
  assert.equal(redacted.includes(secret), false);
  assert.equal(redacted.includes('YWJj'), false);
});

test('pushAllToRemote and executeFastReconcile redact tokens from git failure messages', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-redact-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const secret = 'ghp_pushFailSecretXYZ';
  const adapter = new GitHubWikiLiveAdapter({ token: secret, localCloneDir: root });
  adapter.seedComprehensiveWikiSuite();
  t.mock.method(childProcess, 'execFileSync', (_cmd: string, args: readonly string[]) => {
    if (args.includes('push') || args.includes('fetch')) {
      throw new Error(`remote rejected https://x-access-token:${secret}@github.com/o/r.wiki.git`);
    }
    if (args.includes('--porcelain')) return '';
    return '1\t0\n';
  });
  const pushRes = adapter.pushAllToRemote();
  assert.equal(pushRes.success, false);
  assert.equal(pushRes.message.includes(secret), false);
  const reconcileRes = executeFastReconcile({
    cloneDir: root,
    remoteUrl: adapter.getWikiRemoteUrl(),
    remoteRepo: 'o/r.wiki.git',
    token: secret,
    options: { force: true }
  });
  assert.equal(reconcileRes.success, false);
  assert.equal(reconcileRes.message.includes(secret), false);
});

test('isPathInsideDir rejects prefix collisions on sibling directories', () => {
  const base = path.resolve(os.tmpdir(), 'wiki-cache');
  assert.equal(isPathInsideDir(base, path.join(base, 'Home.md')), true);
  assert.equal(isPathInsideDir(base, `${base}-evil${path.sep}Home.md`), false);
  assert.equal(isPathInsideDir(base, base), false);
});
