import { test } from 'node:test';
import * as assert from 'node:assert';
import { GodotLeakRadar } from './ui/godot-leak-radar.js';

test('GodotLeakRadar detects orphan node leak delta and reports evaluation', () => {
  const cleanEval = GodotLeakRadar.evaluateOrphanDelta(5, 5);
  assert.strictEqual(cleanEval.hasLeak, false);
  assert.strictEqual(cleanEval.delta, 0);
  assert.ok(cleanEval.message.includes('Zero orphan node leaks'));

  const leakEval = GodotLeakRadar.evaluateOrphanDelta(5, 12);
  assert.strictEqual(leakEval.hasLeak, true);
  assert.strictEqual(leakEval.delta, 7);
  assert.ok(leakEval.message.includes('MEMORY LEAK DETECTED'));
});

test('GodotLeakRadar parses orphan node counts and ObjectDB logs', () => {
  const sampleLog = '--- Execution Log ---\norphan_node_count: 8\nObjectDB count: 1420\nResource count: 320\n';
  const orphanCount = GodotLeakRadar.parseOrphanNodeOutput(sampleLog);
  assert.strictEqual(orphanCount, 8);

  const dbCounts = GodotLeakRadar.parseObjectDbCount(sampleLog);
  assert.strictEqual(dbCounts.objectCount, 1420);
  assert.strictEqual(dbCounts.resourceCount, 320);
});

test('GodotLeakRadar audits GDScript memory hygiene for signal leaks', () => {
  const leakyScript = `
extends Control
func _ready():
    for i in range(10):
        var btn = Button.new()
        btn.pressed.connect(func(): print("leak"))
`;
  const report = GodotLeakRadar.auditScriptMemoryHygiene(leakyScript);
  assert.strictEqual(report.clean, false);
  assert.ok(report.issues.some(i => i.includes('CONNECT_ONE_SHOT')));
});
