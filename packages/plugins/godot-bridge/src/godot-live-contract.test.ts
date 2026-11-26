import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { GodotLocator } from './godot-locator.js';
import { WsBridgeServer } from './rpc/ws-bridge-server.js';
import type { GodotUiTreePayload } from './rpc/rpc-types.js';

function createFixture(root: string): void {
  const source = path.resolve(__dirname, '../gdscript/addons/aegis_bridge');
  fs.cpSync(source, path.join(root, 'addons/aegis_bridge'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project.godot'), [
    'config_version=5', '[application]', 'run/main_scene="res://main.tscn"', '[autoload]',
    'AegisBridge="*res://addons/aegis_bridge/aegis_client.gd"', '[display]',
    'window/size/viewport_width=1280', 'window/size/viewport_height=720',
    '[rendering]', 'renderer/rendering_method="gl_compatibility"'
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'main.tscn'), [
    '[gd_scene format=3]', '[node name="Main" type="Control"]',
    '[node name="Status" type="Label" parent="."]', 'text="READY"'
  ].join('\n'));
}

test('real Godot bridge reports actual viewport and propagates scenario assertion failure', async t => {
  const runtime = GodotLocator.findGodot();
  if (!runtime) { t.skip('Requires an installed Godot runtime'); return; }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-live-contract-'));
  createFixture(root);
  const token = randomUUID();
  let telemetry: GodotUiTreePayload | undefined;
  const bridge = new WsBridgeServer({ port: 0, sessionToken: token, onTelemetry: value => { telemetry = value; } });
  const port = await bridge.start();
  const child = spawn(runtime.binaryPath, ['--headless', '--path', root, '--audio-driver', 'Dummy',
    '--', `--aegis-port=${port}`, `--aegis-token=${token}`], { windowsHide: true });
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  let stderr = '';
  child.stdout.resume(); child.stderr.on('data', value => { stderr += String(value); });
  try {
    const deadline = Date.now() + 10000;
    while (!bridge.isClientConnected() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(bridge.isClientConnected(), stderr);
    await assertBridgeContract(bridge, () => telemetry);
    assert.ok(!stderr.includes('SCRIPT ERROR:'), stderr);
  } finally {
    child.kill(); await closed; await bridge.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function assertBridgeContract(bridge: WsBridgeServer, telemetry: () => GodotUiTreePayload | undefined): Promise<void> {
  assert.equal((await bridge.executeCommand({ id: randomUUID(), action: 'ping' })).success, true);
  assert.equal((await bridge.executeCommand({ id: randomUUID(), action: 'get_ui_tree' })).success, true);
  const size = await bridge.executeCommand({ id: randomUUID(), action: 'eval', payload: {
    expr: '[get_viewport().get_visible_rect().size.x, get_viewport().get_visible_rect().size.y]'
  } });
  const dimensions = (size.data as { eval_result: number[] }).eval_result;
  assert.equal(telemetry()?.viewport.width, dimensions[0]);
  assert.equal(telemetry()?.viewport.height, dimensions[1]);
  assert.ok(dimensions[0] > 0 && dimensions[1] > 0);
  const payload = (expected: string) => ({ actions: [{ type: 'assert_text', path: 'Main/Status', expected }] });
  const good = await bridge.executeCommand({ id: randomUUID(), action: 'simulate_input', payload: payload('READY') });
  const bad = await bridge.executeCommand({ id: randomUUID(), action: 'simulate_input', payload: payload('WRONG') });
  assert.equal(good.success, true);
  assert.equal(bad.success, false);
  assert.deepEqual(bad.data && (bad.data as { result: { executed_actions: number } }).result.executed_actions, 1);
}
