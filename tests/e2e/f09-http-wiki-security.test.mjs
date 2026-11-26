import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, createTempWorkspace, initTempGitRepo } from './helpers/cli-runner.mjs';
import { getFreePort } from './helpers/net-helpers.mjs';

const GITHUB_LIVE_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/core/github-live/dist/index.js')
).href;
const WIKI_HELPERS_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/core/github-live/dist/wiki-helpers.js')
).href;

function startTestHttpServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const close = () => new Promise((res) => {
        server.closeAllConnections?.();
        server.close(() => res());
      });
      resolve({ url: `http://127.0.0.1:${port}`, close });
    });
  });
}

async function testRotateCookieParsingAndGuards() {
  const { HttpRotateEngine } = await import(GITHUB_LIVE_URL);
  const missingBinding = HttpRotateEngine.parseCookies('SID=abc');
  assert.equal(HttpRotateEngine.canRotate(missingBinding), false);
  const valid = HttpRotateEngine.parseCookies('SID=s1; OSID=o1; __Secure-OSID=so1; SAPISID=sap1');
  assert.equal(HttpRotateEngine.canRotate(valid), true);
  const header = HttpRotateEngine.buildAccountsCookieHeader(valid);
  assert.equal(header.includes('OSID='), false, 'OSID must be stripped for accounts endpoint');
  assert.equal(header.includes('SID=s1'), true);
  const extracted = HttpRotateEngine.extractSetCookies({
    'set-cookie': ['__Secure-1PSIDTS=new1; Path=/', 'SIDCC=cc1; Secure', 'EMPTY=""; Path=/']
  });
  assert.equal(extracted.get('__Secure-1PSIDTS'), 'new1');
  assert.equal(extracted.get('SIDCC'), 'cc1');
  assert.equal(extracted.has('EMPTY'), false);
}

async function testLiveMultiSetCookiePreservationAndRotate(t) {
  const { fetchPostWithTimeout, HttpRotateEngine } = await import(GITHUB_LIVE_URL);
  const srv = await startTestHttpServer((_req, res) => {
    res.setHeader('Set-Cookie', [
      '__Secure-1PSIDTS=rotated-psidts; Path=/; HttpOnly',
      'SIDCC=rotated-sidcc; Path=/; Secure'
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('["ok"]');
  });
  t.after(srv.close);
  const rawRes = await fetchPostWithTimeout(srv.url, '{}', { timeoutMs: 3000 });
  assert.ok(Array.isArray(rawRes.headers['set-cookie']), 'set-cookie must be preserved as array');
  assert.equal(rawRes.headers['set-cookie'].length, 2);
  const rotated = await HttpRotateEngine.rotate('SID=s1; OSID=o1; __Secure-1PSIDTS=old', {
    saveOnSuccess: false,
    httpPost: (_u, b, o) => fetchPostWithTimeout(srv.url, b, o)
  });
  assert.equal(rotated.success, true);
  assert.equal(rotated.newPsidts, 'rotated-psidts');
  assert.match(rotated.refreshedCookies ?? '', /SIDCC=rotated-sidcc/);
}

function testRepoWikiCacheHasNoPlaintextToken() {
  const cfgPath = path.join(REPO_ROOT, '.aegis/wiki-cache/.git/config');
  if (!fs.existsSync(cfgPath)) return;
  const content = fs.readFileSync(cfgPath, 'utf8');
  assert.equal(/gh[pousr]_|x-access-token|\/\/[^/\s]+@github\.com/i.test(content), false, 'wiki-cache .git/config must not embed tokens');
}

async function testWikiAuthEnvAndRedaction() {
  const { buildGitAuthEnv, redactGitToken } = await import(WIKI_HELPERS_URL);
  const secret = 'ghp_secretTokenValue12345';
  const env = buildGitAuthEnv(secret, { PATH: process.env.PATH ?? '' });
  assert.equal(env.GIT_CONFIG_COUNT, '1');
  assert.equal(env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.match(env.GIT_CONFIG_VALUE_0 ?? '', /^AUTHORIZATION: basic /);
  const b64 = Buffer.from(`x-access-token:${secret}`, 'utf8').toString('base64');
  const dirty = `fatal: https://x-access-token:${secret}@github.com/o/r failed AUTHORIZATION: basic ${b64} raw=${secret}`;
  const clean = redactGitToken(dirty, secret);
  assert.equal(clean.includes(secret), false, 'Raw PAT must be redacted');
  assert.equal(clean.includes(b64), false, 'Base64 basic auth must be redacted');
}

async function testWikiIsPathInsideDir() {
  const { isPathInsideDir } = await import(WIKI_HELPERS_URL);
  const base = path.resolve('/tmp/aegis-wiki-base');
  assert.equal(isPathInsideDir(base, path.join(base, 'Home.md')), true);
  assert.equal(isPathInsideDir(base, base), false, 'Base directory itself must return false');
  assert.equal(isPathInsideDir(base, `${base}-evil/Home.md`), false, 'Prefix collision must return false');
  assert.equal(isPathInsideDir(base, path.join(base, '../escape.md')), false);
}

async function testBodyInclusiveTimeoutAbortsStalledStream(t) {
  const { fetchPostWithTimeout } = await import(GITHUB_LIVE_URL);
  const sockets = new Set();
  const srv = await startTestHttpServer((_req, res) => {
    sockets.add(res.socket);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('partial-chunk-');
  });
  t.after(async () => {
    for (const s of sockets) s?.destroy();
    await srv.close();
  });
  const started = Date.now();
  await assert.rejects(
    () => fetchPostWithTimeout(srv.url, '{}', { timeoutMs: 100 }),
    /abort|timed?\s*out/i
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `Expected quick abort on stalled body, took ${elapsed}ms`);
}

async function testNotebookLmClientHandlesErrorsAndTimeouts(t) {
  const { NotebookLmNativeClient, fetchPostWithTimeout } = await import(GITHUB_LIVE_URL);
  let mode = '401';
  const srv = await startTestHttpServer((_req, res) => {
    if (mode === '401') {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('stalling-');
  });
  t.after(srv.close);
  const client = new NotebookLmNativeClient({
    cookies: 'SID=1; OSID=2',
    timeoutMs: 120,
    httpPost: (_u, b, o) => fetchPostWithTimeout(srv.url, b, o)
  });
  await assert.rejects(() => client.listNotebooks(), /401|AUTH|Unauthorized/i);
  mode = 'stall';
  await assert.rejects(() => client.listNotebooks(), /abort|timed?\s*out/i);
}

async function testWikiAdapterTokenFreeConfigAndPublishing(t) {
  const ws = createTempWorkspace('aegis-f09-wiki-');
  t.after(ws.cleanup);
  const { GitHubWikiLiveAdapter } = await import(GITHUB_LIVE_URL);
  const secret = 'ghp_dummyWikiSecret987654';
  const adapter = new GitHubWikiLiveAdapter({
    token: secret,
    owner: 'acme',
    repo: 'widget',
    localCloneDir: ws.dir
  });
  assert.equal(adapter.getWikiRemoteUrl(), 'https://github.com/acme/widget.wiki.git');
  assert.equal(adapter.getWikiRemoteUrl().includes(secret), false);
  adapter.seedComprehensiveWikiSuite();
  adapter.publishPage('CustomPage', 'Custom Title', ['b1', 'b2', 'b3'], 'Details');
  const page = adapter.getPage('CustomPage');
  assert.equal(page?.title, 'Custom Title');
  const gitCfg = path.join(ws.dir, '.git/config');
  if (fs.existsSync(gitCfg)) {
    assert.equal(fs.readFileSync(gitCfg, 'utf8').includes(secret), false);
  }
}

async function testWikiPushErrorRedactsToken(t) {
  const ws = createTempWorkspace('aegis-f09-push-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  const deadPort = await getFreePort();
  const secret = 'ghp_livePushRedactSecret42';
  const { GitHubWikiLiveAdapter } = await import(GITHUB_LIVE_URL);
  const adapter = new GitHubWikiLiveAdapter({
    token: secret,
    owner: 'acme',
    repo: 'widget',
    localCloneDir: ws.dir
  });
  fs.writeFileSync(path.join(ws.dir, 'Home.md'), '# Home\n', 'utf8');
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['remote', 'add', 'origin', `http://127.0.0.1:${deadPort}/acme/widget.wiki.git`], { cwd: ws.dir });
  const res = adapter.pushAllToRemote();
  assert.equal(res.success, false);
  assert.equal(res.message.includes(secret), false, 'pushAllToRemote error message must not leak token');
}

async function testWikiAdapterSlugPathTraversalBlocked(t) {
  const base = createTempWorkspace('aegis-f09-slug-');
  t.after(base.cleanup);
  const cloneDir = path.join(base.dir, 'wiki');
  fs.mkdirSync(cloneDir, { recursive: true });
  const outsideFile = path.join(base.dir, 'outside.md');
  fs.writeFileSync(outsideFile, '# Secret Outside\n', 'utf8');
  const { GitHubWikiLiveAdapter } = await import(GITHUB_LIVE_URL);
  const adapter = new GitHubWikiLiveAdapter({ localCloneDir: cloneDir });
  assert.equal(adapter.getPage('../outside'), undefined, 'getPage must not read parent directory');
  adapter.publishPage('../evil', 'Evil', ['a', 'b', 'c'], 'payload');
  assert.equal(fs.existsSync(path.join(base.dir, 'evil.md')), false, 'publishPage must not write outside cloneDir');
}

function registerTier1() {
  test('T1.1 HttpRotateEngine validates bindings, strips OSID, and extracts multi Set-Cookie', testRotateCookieParsingAndGuards);
  test('T1.2 fetchPostWithTimeout and HttpRotateEngine preserve multi Set-Cookie over HTTP', testLiveMultiSetCookiePreservationAndRotate);
  test('T1.3 repo .aegis/wiki-cache/.git/config has zero plaintext tokens', testRepoWikiCacheHasNoPlaintextToken);
  test('T1.4 buildGitAuthEnv uses GIT_CONFIG_COUNT and redactGitToken scrubs secrets', testWikiAuthEnvAndRedaction);
  test('T1.5 isPathInsideDir rejects base dir and sibling prefix collisions', testWikiIsPathInsideDir);
}

function registerTier2() {
  test('T2.1 fetchPostWithTimeout aborts stalled HTTP response body within timeoutMs', testBodyInclusiveTimeoutAbortsStalledStream);
  test('T2.2 NotebookLmNativeClient handles 401 and stalled body timeout over HTTP', testNotebookLmClientHandlesErrorsAndTimeouts);
  test('T2.3 GitHubWikiLiveAdapter keeps remote URL and .git/config free of tokens', testWikiAdapterTokenFreeConfigAndPublishing);
  test('T2.4 GitHubWikiLiveAdapter.pushAllToRemote redacts tokens on network failure', testWikiPushErrorRedactsToken);
  test('T2.5 GitHubWikiLiveAdapter sanitizes traversal slugs against outside access', testWikiAdapterSlugPathTraversalBlocked);
}

describe('Tier 1: F09 HTTP Multi-Cookie, Body Timeout & Wiki Auth Contracts', registerTier1);
describe('Tier 2: F09 Live HTTP Transport & Wiki Adapter Security', registerTier2);
