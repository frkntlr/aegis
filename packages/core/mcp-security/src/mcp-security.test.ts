import { test } from 'node:test';
import * as assert from 'node:assert';
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
  assert.strictEqual(manager.authorizeToolCall('ui', 'godot_playtest').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('solver', 'godot_validate').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('qa', 'godot_status').allowed, true);
  assert.strictEqual(manager.authorizeToolCall('docs', 'godot_inspect').allowed, false);
});
