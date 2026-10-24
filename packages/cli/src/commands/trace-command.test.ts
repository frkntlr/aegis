import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleTrace } from './trace-command.js';
import { handleGraphScan } from './graph-command.js';

function captureOutput(fn: () => void): string {
  const originalLog = console.log;
  const originalErr = console.error;
  let logs = '';
  console.log = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  try {
    fn();
    return logs;
  } finally {
    console.log = originalLog;
    console.error = originalErr;
  }
}

test('handleGraphScan scans files and writes graph cache', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-graph-test-'));
  const testFile = path.join(tmpDir, 'hero.gd');
  fs.writeFileSync(testFile, 'class_name Hero\nsignal dead\nfunc die():\n    dead.emit()\n', 'utf8');

  const oldCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    const output = captureOutput(() => handleGraphScan(tmpDir));
    assert.ok(output.includes('Relational Knowledge Graph'));
    assert.ok(output.includes('Graph Saved'));
    assert.ok(fs.existsSync(path.join(tmpDir, '.aegis', 'cache', 'graph.json')));
  } finally {
    process.chdir(oldCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleTrace executes relational trace and displays callers & blast radius', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-trace-test-'));
  const testScene = path.join(tmpDir, 'game.tscn');
  const tscnContent = [
    '[gd_scene load_steps=2 format=3]',
    '[ext_resource type="Script" path="res://player.gd" id="1_p"]',
    '[node name="Game" type="Node2D"]',
    'script = ExtResource("1_p")',
    '[node name="Btn" type="Button" parent="."] ',
    '[connection signal="pressed" from="Btn" to="." method="_on_btn_pressed"]'
  ].join('\n');
  fs.writeFileSync(testScene, tscnContent, 'utf8');

  const oldCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    captureOutput(() => handleGraphScan(tmpDir));
    const output = captureOutput(() => handleTrace('_on_btn_pressed'));
    assert.ok(output.includes('RELATIONAL TRACE'));
    assert.ok(output.includes('Connected Scenes') || output.includes('Upstream Callers'));
  } finally {
    process.chdir(oldCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
