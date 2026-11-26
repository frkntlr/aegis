import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MCPSecurityManager } from './rbac.js';

test('MCPSecurityManager authorizes tools in allowlist', () => {
  const manager = new MCPSecurityManager();
  const res = manager.authorizeToolCall('alice', 'read_file');
  assert.strictEqual(res.allowed, true);
});

test('MCPSecurityManager blocks unauthorized tools', () => {
  const manager = new MCPSecurityManager();
  const res = manager.authorizeToolCall('alice', 'unauthorized_network_tool');
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason?.includes('lacks scope'));
});

test('MCPSecurityManager denies destructive tools to autonomous agents', () => {
  const manager = new MCPSecurityManager();
  const res = manager.authorizeToolCall('bob', 'delete_branch');
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason?.includes('destructive and requires Human-in-the-Loop'));

  // Human is permitted
  const humanRes = manager.authorizeToolCall('human', 'delete_branch');
  assert.strictEqual(humanRes.allowed, true);
});

test('MCPSecurityManager enforces rate limiting', () => {
  const manager = new MCPSecurityManager({ maxCallsPerMinute: 3 });
  assert.strictEqual(manager.authorizeToolCall('alice', 'read_file').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('alice', 'read_file').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('alice', 'read_file').allowed, true);

  // 4th call must be blocked
  const res4 = manager.authorizeToolCall('alice', 'read_file');
  assert.strictEqual(res4.allowed, false);
  assert.ok(res4.reason?.includes('Rate limit reached'));
});

test('MCPSecurityManager counts unauthorized calls toward rate limit', () => {
  const manager = new MCPSecurityManager({ maxCallsPerMinute: 2 });
  // Call 1: unauthorized
  assert.strictEqual(manager.authorizeToolCall('bob', 'unknown_tool').allowed, false);
  // Call 2: unauthorized
  assert.strictEqual(manager.authorizeToolCall('bob', 'unknown_tool').allowed, false);
  // Call 3: should now be blocked by rate limit
  const res3 = manager.authorizeToolCall('bob', 'read_file');
  assert.strictEqual(res3.allowed, false);
  assert.ok(res3.reason?.includes('Rate limit reached'));
});

test('MCPSecurityManager authorizes UI specialist and Godot toolchain', () => {
  const manager = new MCPSecurityManager();
  assert.strictEqual(manager.authorizeToolCall('ui', 'read_file').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('ui', 'inspect_ui').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('ui', 'godot_inspect').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('ui', 'aegis_godot_inspect_ui').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('ui', 'godot_playtest').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('solver', 'godot_validate').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('solver', 'aegis_godot_validate').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('qa', 'godot_status').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('qa', 'aegis_godot_status').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('docs', 'godot_inspect').allowed, false);
});

test('MCPSecurityManager authorizes teamwork tools for all subagent personas', () => {
  const manager = new MCPSecurityManager();
  const subagents = ['issue-solver', 'qa-hunter', 'ui-specialist', 'doc-architect'];
  const teamworkTools = [
    'task_inbox_pull', 'task_claim', 'task_release', 'lock_status',
    'worktree_status', 'teamwork_status', 'teamwork_compact', 'teamwork_dag'
  ];
  for (const agent of subagents) {
    for (const tool of teamworkTools) {
      assert.strictEqual(manager.authorizeToolCall(agent, tool).allowed, true, agent + ' should be allowed to call ' + tool);
    }
  }
});

test('MCPSecurityManager authorizes memory and quality inspection tools for solvers and hunters', () => {
  const manager = new MCPSecurityManager();
  assert.strictEqual(manager.authorizeToolCall('solver', 'skeleton_extract').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('solver', 'budget_inspect').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('solver', 'socratic_diagnose').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('qa-hunter', 'skeleton_extract').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('qa-hunter', 'budget_inspect').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('qa-hunter', 'socratic_diagnose').allowed, true);
});

test('authorizeFileOperation allows valid paths inside worktree and human bypass', () => {
  const manager = new MCPSecurityManager();
  const wt = path.resolve(os.tmpdir(), 'aegis-wt-test');
  assert.strictEqual(manager.authorizeFileOperation('solver', 'src/index.ts', wt).allowed, true);
  assert.strictEqual(manager.authorizeFileOperation('solver', path.join(wt, 'src', 'app.ts'), wt).allowed, true);
  assert.strictEqual(manager.authorizeFileOperation('human', '/etc/passwd', wt).allowed, true);
  assert.strictEqual(manager.authorizeFileOperation('solver', '/etc/passwd').allowed, true);
});

test('authorizeFileOperation blocks traversal, prefix collision, absolute escape, and null bytes', () => {
  const manager = new MCPSecurityManager();
  const wt = path.resolve(os.tmpdir(), 'aegis-wt-main');
  assert.strictEqual(manager.authorizeFileOperation('solver', '../secret.ts', wt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', '..\\secret.ts', wt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', `${wt}/../secret.ts`, wt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', `${wt}-other/file.ts`, wt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', '/etc/passwd', wt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'C:/Windows/win.ini', wt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'src/bad\0.ts', wt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', '   ', wt).allowed, false);
});

test('authorizeFileOperation handles Windows case-insensitivity and cross-drive denials', () => {
  const manager = new MCPSecurityManager();
  const winWt = 'C:\\Repo\\Worktree';
  assert.strictEqual(manager.authorizeFileOperation('solver', 'c:/repo/worktree/src/a.ts', winWt).allowed, true);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'c:/repo/worktree/../secret.ts', winWt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'C:\\Windows\\win.ini', winWt).allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'D:\\Repo\\Worktree\\a.ts', winWt).allowed, false);
});

test('authorizeFileOperation blocks symlink escapes outside worktree', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rbac-sym-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const wt = path.join(root, 'wt');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(wt, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  const linkPath = path.join(wt, 'escape-link');
  try {
    fs.symlinkSync(outside, linkPath, 'dir');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES')) return;
    throw err;
  }
  const manager = new MCPSecurityManager();
  const res = manager.authorizeFileOperation('solver', path.join(linkPath, 'secret.ts'), wt);
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason?.includes('outside worktree'));
});

test('authorizeFileOperation allows 35-level deep non-existent path inside worktree', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rbac-deep-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const wt = path.join(root, 'wt');
  fs.mkdirSync(wt, { recursive: true });
  const deepRel = `${Array.from({ length: 35 }, (_, i) => `d${i}`).join('/')}/file.ts`;
  const manager = new MCPSecurityManager();
  const res = manager.authorizeFileOperation('solver', deepRel, wt);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(manager.authorizeFileOperation('solver', `../${deepRel}`, wt).allowed, false);
});

test('authorizeFileOperation fails closed on dangling symlink loops and escapes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rbac-loop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const wt = path.join(root, 'wt');
  fs.mkdirSync(wt, { recursive: true });
  const linkA = path.join(wt, 'loop-a');
  const linkB = path.join(wt, 'loop-b');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    fs.symlinkSync(linkB, linkA, linkType);
    fs.symlinkSync(linkA, linkB, linkType);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES')) return;
    throw err;
  }
  const manager = new MCPSecurityManager();
  const res = manager.authorizeFileOperation('solver', path.join(linkA, 'nested', 'file.ts'), wt);
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason?.includes('outside worktree'));
});

test('authorizeFileOperation fails closed on dangling junction to unused drive', (t) => {
  if (process.platform !== 'win32') return;
  const unused = ['Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R', 'Q'].find((l) => !fs.existsSync(`${l}:\\`));
  if (!unused) return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rbac-drv-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const wt = path.join(root, 'wt');
  fs.mkdirSync(wt, { recursive: true });
  const linkPath = path.join(wt, 'junc-unused');
  try {
    fs.symlinkSync(`${unused}:\\evil\\dir`, linkPath, 'junction');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EPERM' || code === 'EACCES') return;
    throw err;
  }
  const res = new MCPSecurityManager().authorizeFileOperation('solver', 'junc-unused/file.ts', wt);
  assert.strictEqual(res.allowed, false);
  assert.ok(res.reason?.includes('outside worktree'));
});

test('authorizeFileOperation blocks Windows drive-relative paths on same or other drives', () => {
  const manager = new MCPSecurityManager();
  assert.strictEqual(manager.authorizeFileOperation('solver', 'C:foo.ts', 'C:\\SomeNonCwdWorktree').allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'D:foo.ts', 'C:\\SomeNonCwdWorktree').allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'C:', 'C:\\SomeNonCwdWorktree').allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'foo.ts', 'C:SomeNonCwdWorktree').allowed, false);
});

test('authorizeFileOperation fails closed on Win32 device and extended-length worktree paths', (t) => {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rbac-ext-'));
  t.after(() => fs.rmSync(wt, { recursive: true, force: true }));
  const manager = new MCPSecurityManager();
  const extRes = manager.authorizeFileOperation('solver', 'sub/a.ts', `\\\\?\\${wt}`);
  assert.strictEqual(extRes.allowed, false);
  assert.ok(extRes.reason?.includes('outside worktree'));
  assert.strictEqual(manager.authorizeFileOperation('solver', 'sub/a.ts', '//?/C:/NonExistentWt').allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'sub/a.ts', '\\\\.\\C:\\NonExistentWt').allowed, false);
  assert.strictEqual(manager.authorizeFileOperation('solver', `\\\\?\\${path.join(wt, 'sub', 'a.ts')}`, wt).allowed, false);
});

test('MCPSecurityManager denies unregistered agents, resolves role aliases, and logs audit events', () => {
  const manager = new MCPSecurityManager();
  assert.strictEqual(manager.authorizeToolCall('unknown-bot', 'read_file').allowed, false);
  assert.strictEqual(manager.authorizeToolCall('@custom-solver', 'write_file').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('custom-hunter', 'inspect_ui').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('custom-specialist', 'inspect_ui').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('custom-architect', 'write_wiki').allowed, true);
  assert.strictEqual(manager.authorizeFileOperation('solver', 'foo.ts', '//./C:/NonExistentWt').allowed, false);
  const logs = manager.getAuditLog();
  assert.ok(logs.some((e) => e.agent === 'unknown-bot' && !e.allowed));
  assert.ok(logs.some((e) => e.agent === '@custom-solver' && e.allowed));
});
