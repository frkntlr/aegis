import { test } from 'node:test';
import * as assert from 'node:assert';
import { GodotMcpProvider } from './godot-mcp-provider.js';

test('GodotMcpProvider exposes exactly 8 authoritative tools', () => {
  const tools = GodotMcpProvider.getToolDefinitions();
  assert.strictEqual(tools.length, 8);
  const names = tools.map(t => t.name);

  assert.ok(names.includes('aegis_godot_status'));
  assert.ok(names.includes('aegis_godot_playtest'));
  assert.ok(names.includes('aegis_godot_inspect_ui'));
  assert.ok(names.includes('aegis_godot_tree'));
  assert.ok(names.includes('aegis_godot_signals'));
  assert.ok(names.includes('aegis_godot_screenshot'));
  assert.ok(names.includes('aegis_godot_validate'));
  assert.ok(names.includes('aegis_godot_eval'));
});

test('GodotMcpProvider handles tool calls correctly', async () => {
  const statusRes = await GodotMcpProvider.handleToolCall('aegis_godot_status', {});
  const status = JSON.parse(statusRes);
  assert.ok('active' in status);

  const signalsRes = await GodotMcpProvider.handleToolCall('aegis_godot_signals', { className: 'Button' });
  const sig = JSON.parse(signalsRes);
  assert.strictEqual(sig.className, 'Button');
  assert.ok(Array.isArray(sig.signals));
});
