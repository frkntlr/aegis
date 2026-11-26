import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, createTempWorkspace } from './helpers/cli-runner.mjs';

const MCP_SEC_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/core/mcp-security/dist/index.js')
).href;

async function loadManager(options) {
  const { MCPSecurityManager } = await import(MCP_SEC_URL);
  return new MCPSecurityManager(options);
}

async function testRoleScopedToolPermissions() {
  const mgr = await loadManager();
  assert.equal(mgr.authorizeToolCall('issue-solver', 'write_file').allowed, true);
  assert.equal(mgr.authorizeToolCall('qa-hunter', 'aegis_godot_playtest').allowed, true);
  assert.equal(mgr.authorizeToolCall('ui-specialist', 'inspect_ui').allowed, true);
  assert.equal(mgr.authorizeToolCall('doc-architect', 'wiki_sync').allowed, true);
  const deniedDoc = mgr.authorizeToolCall('doc-architect', 'aegis_godot_playtest');
  assert.equal(deniedDoc.allowed, false);
  const unknown = mgr.authorizeToolCall('ghost-agent', 'read_file');
  assert.equal(unknown.allowed, false);
}

async function testDestructiveToolBlocking() {
  const mgr = await loadManager();
  for (const tool of ['delete_branch', 'force_push', 'drop_database', 'rm_rf']) {
    const res = mgr.authorizeToolCall('issue-solver', tool);
    assert.equal(res.allowed, false, `Autonomous agent must be blocked from ${tool}`);
    assert.match(res.reason ?? '', /destructive/i);
    assert.equal(mgr.authorizeToolCall('human', tool).allowed, true, `Human should allow ${tool}`);
  }
}

async function testRateLimitingAndAuditLog() {
  const mgr = await loadManager({ maxCallsPerMinute: 3 });
  assert.equal(mgr.authorizeToolCall('solver', 'read_file').allowed, true);
  assert.equal(mgr.authorizeToolCall('solver', 'write_file').allowed, true);
  assert.equal(mgr.authorizeToolCall('solver', 'unknown_tool').allowed, false);
  const fourth = mgr.authorizeToolCall('solver', 'read_file');
  assert.equal(fourth.allowed, false);
  assert.match(fourth.reason ?? '', /rate limit/i);
  const deniedLogs = mgr.getAuditLog().filter((e) => !e.allowed);
  assert.equal(deniedLogs.length, 2);
}

async function testAllowedFileOperations(t) {
  const ws = createTempWorkspace('aegis-f08-ok-');
  t.after(ws.cleanup);
  const mgr = await loadManager();
  assert.equal(mgr.authorizeFileOperation('solver', 'src/app.ts', ws.dir).allowed, true);
  assert.equal(mgr.authorizeFileOperation('solver', path.join(ws.dir, 'nested/a.ts'), ws.dir).allowed, true);
  assert.equal(mgr.authorizeFileOperation('solver', '.', ws.dir).allowed, true);
  assert.equal(mgr.authorizeFileOperation('human', '/etc/passwd', ws.dir).allowed, true);
  assert.equal(mgr.authorizeFileOperation('solver', '../outside.ts').allowed, true);
}

async function testNullByteAndEmptyFilePaths(t) {
  const ws = createTempWorkspace('aegis-f08-null-');
  t.after(ws.cleanup);
  const mgr = await loadManager();
  for (const bad of ['', '   ', 'src/bad\0.ts', 'sub/\0file']) {
    const res = mgr.authorizeFileOperation('solver', bad, ws.dir);
    assert.equal(res.allowed, false, `Expected rejection for invalid path ${JSON.stringify(bad)}`);
  }
  const badWt = mgr.authorizeFileOperation('solver', 'src/ok.ts', `${ws.dir}\0evil`);
  assert.equal(badWt.allowed, false);
  assert.ok(mgr.getAuditLog().length >= 5);
}

async function testRelativeAndAbsoluteTraversalBlocked(t) {
  const ws = createTempWorkspace('aegis-f08-trav-');
  t.after(ws.cleanup);
  const mgr = await loadManager();
  const payloads = [
    '../secret.ts',
    '..\\secret.ts',
    'a/b/../../../secret.ts',
    `${ws.dir}/a/../../outside.ts`,
    '/etc/passwd',
    'C:/Windows/System32/drivers/etc/hosts'
  ];
  for (const p of payloads) {
    const res = mgr.authorizeFileOperation('solver', p, ws.dir);
    assert.equal(res.allowed, false, `Traversal payload should be denied: ${p}`);
  }
}

async function testPrefixCollisionBypassBlocked(t) {
  const ws = createTempWorkspace('aegis-f08-pref-');
  t.after(ws.cleanup);
  const mgr = await loadManager();
  const parent = path.dirname(ws.dir);
  const baseName = path.basename(ws.dir);
  const siblingDash = path.join(parent, `${baseName}-evil`, 'file.ts');
  const siblingUnder = path.join(parent, `${baseName}_backup`, 'file.ts');
  assert.equal(mgr.authorizeFileOperation('solver', siblingDash, ws.dir).allowed, false);
  assert.equal(mgr.authorizeFileOperation('solver', siblingUnder, ws.dir).allowed, false);
  assert.equal(mgr.authorizeFileOperation('solver', parent, ws.dir).allowed, false);
}

async function testWindowsDriveAndCaseSensitivity() {
  const mgr = await loadManager();
  const wt = 'C:\\Repo\\Worktree';
  assert.equal(mgr.authorizeFileOperation('solver', 'D:\\Repo\\Worktree\\a.ts', wt).allowed, false);
  assert.equal(mgr.authorizeFileOperation('solver', 'C:\\Repo\\Worktree-evil\\a.ts', wt).allowed, false);
  assert.equal(mgr.authorizeFileOperation('solver', 'c:/repo/worktree/src/a.ts', wt).allowed, true);
  assert.equal(mgr.authorizeFileOperation('solver', 'c:/repo/worktree/../secret.ts', wt).allowed, false);
  assert.equal(mgr.authorizeFileOperation('solver', 'C:\\Repo\\Worktree\\a.ts', '/tmp/posix-wt').allowed, false);
}

async function testSymlinkEscapeBlocked(t) {
  const base = createTempWorkspace('aegis-f08-sym-');
  t.after(base.cleanup);
  const wt = path.join(base.dir, 'wt');
  const outside = path.join(base.dir, 'outside');
  fs.mkdirSync(wt, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret', 'utf8');
  const linkDir = path.join(wt, 'escape-link');
  try {
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(outside, linkDir, type);
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) return;
    throw err;
  }
  const mgr = await loadManager();
  assert.equal(mgr.authorizeFileOperation('solver', path.join(linkDir, 'secret.txt'), wt).allowed, false);
  assert.equal(mgr.authorizeFileOperation('solver', 'escape-link/new-nested/file.ts', wt).allowed, false);
}

async function testAuditTrailRecordsDeniedTraversals(t) {
  const ws = createTempWorkspace('aegis-f08-audit-');
  t.after(ws.cleanup);
  const mgr = await loadManager();
  mgr.authorizeFileOperation('qa-hunter', '../escape.ts', ws.dir);
  mgr.authorizeFileOperation('qa-hunter', 'src/valid.ts', ws.dir);
  const log = mgr.getAuditLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].agent, 'qa-hunter');
  assert.equal(log[0].allowed, false);
  assert.ok(typeof log[0].reason === 'string' && log[0].reason.length > 0);
}

function registerTier1() {
  test('T1.1 authorizeToolCall enforces role-scoped permissions', testRoleScopedToolPermissions);
  test('T1.2 authorizeToolCall blocks destructive tools for agents', testDestructiveToolBlocking);
  test('T1.3 rate limiting counts unauthorized calls and logs rejections', testRateLimitingAndAuditLog);
  test('T1.4 authorizeFileOperation permits valid paths and human bypass', testAllowedFileOperations);
  test('T1.5 authorizeFileOperation rejects empty and null-byte paths', testNullByteAndEmptyFilePaths);
}

function registerTier2() {
  test('T2.1 relative and outside absolute path traversals are blocked', testRelativeAndAbsoluteTraversalBlocked);
  test('T2.2 sibling prefix-collision paths are blocked', testPrefixCollisionBypassBlocked);
  test('T2.3 Windows cross-drive and case-insensitive containment works', testWindowsDriveAndCaseSensitivity);
  test('T2.4 filesystem symlink/junction escapes are blocked', testSymlinkEscapeBlocked);
  test('T2.5 audit log captures denied traversal details accurately', testAuditTrailRecordsDeniedTraversals);
}

describe('Tier 1: F08 RBAC Tool & File Authorization Contracts', registerTier1);
describe('Tier 2: F08 Path Traversal, Prefix Collision & Symlink Escapes', registerTier2);
