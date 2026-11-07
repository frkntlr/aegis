import { test } from 'node:test';
import * as assert from 'node:assert';
import { TeamworkDecomposer, TeamworkSharder, type DecomposedSubtask } from './teamwork-decomposer.js';

test('shardQaByFiles shards single QA into subsystem tasks when multiple test files exist', () => {
  const subtasks: DecomposedSubtask[] = [
    { roleType: 'solver', label: 'Core', title: 'Implement feature', targetFiles: [] },
    { roleType: 'qa', label: 'Audit', title: 'Audit feature', targetFiles: [] }
  ];
  const files = ['packages/core/src/parser.test.ts', 'packages/cli/src/build.test.ts'];
  TeamworkSharder.shardQaByFiles(subtasks, files, 'System Audit');

  const qas = subtasks.filter(t => t.roleType === 'qa');
  assert.strictEqual(qas.length, 2);
  assert.strictEqual(qas[0].roleType, 'qa');
  assert.strictEqual(qas[1].roleType, 'qa');
  assert.strictEqual(qas[0].phase, 2);
  assert.strictEqual(qas[1].phase, 2);
  const labels = qas.map(q => q.label);
  assert.ok(labels.includes('Core-parser'));
  assert.ok(labels.includes('Cli-build'));
});

test('shardQaByFiles shards QA into dimensions when single file provided', () => {
  const subtasks: DecomposedSubtask[] = [
    { roleType: 'qa', label: 'Audit', title: 'Audit single file', targetFiles: [] }
  ];
  TeamworkSharder.shardQaByFiles(subtasks, ['src/service.ts'], 'Audit single file');

  const qas = subtasks.filter(t => t.roleType === 'qa');
  assert.strictEqual(qas.length, 3);
  const labels = qas.map(q => q.label);
  assert.deepStrictEqual(labels, ['StaticAudit', 'TypeSafety', 'SafetyGate']);
  assert.ok(qas.every(q => q.phase === 2));
  assert.ok(qas[0].targetFiles.includes('src/service.test.ts'));
});

test('shardQaByFiles shards QA into dimensions when general scope', () => {
  const subtasks: DecomposedSubtask[] = [
    { roleType: 'qa', label: 'Audit', title: 'Audit general scope', targetFiles: [] }
  ];
  TeamworkSharder.shardQaByFiles(subtasks, [], 'Audit general scope');

  const qas = subtasks.filter(t => t.roleType === 'qa');
  assert.strictEqual(qas.length, 3);
  const labels = qas.map(q => q.label);
  assert.deepStrictEqual(labels, ['StaticAudit', 'TypeSafety', 'SafetyGate']);
  assert.ok(qas.every(q => q.targetFiles.length === 0));
});

test('shardQaByDimensions directly partitions QA into 3 parallel dimensions', () => {
  const subtasks: DecomposedSubtask[] = [
    { roleType: 'qa', label: 'Audit', title: 'Direct audit', targetFiles: [] }
  ];
  TeamworkSharder.shardQaByDimensions(subtasks, 'Direct audit', 'test/app.test.ts');

  assert.strictEqual(subtasks.length, 3);
  assert.strictEqual(subtasks[0].label, 'StaticAudit');
  assert.strictEqual(subtasks[1].label, 'TypeSafety');
  assert.strictEqual(subtasks[2].label, 'SafetyGate');
  assert.ok(subtasks.every(s => s.roleType === 'qa' && s.phase === 2));
  assert.ok(subtasks[0].targetFiles.includes('test/app.test.ts'));
});

test('TeamworkDecomposer.decompose creates parallel QA hunters in Phase 2 for multi-test goals', () => {
  const files = ['test/auth/login.test.ts', 'test/db/repo.test.ts'];
  const subtasks = TeamworkDecomposer.decompose('Run comprehensive tests', files);

  const qas = subtasks.filter(t => t.roleType === 'qa');
  assert.strictEqual(qas.length, 2);
  assert.strictEqual(qas[0].phase, 2);
  assert.strictEqual(qas[1].phase, 2);
  const solvers = subtasks.filter(t => t.roleType === 'solver');
  const solverLabels = solvers.map(s => s.label);
  assert.ok(qas[0].dependsOn && solverLabels.every(l => qas[0].dependsOn?.includes(l)));
  assert.ok(qas[1].dependsOn && solverLabels.every(l => qas[1].dependsOn?.includes(l)));
});

test('shardSmartClusters creates multi-agent QA hunters across clusters', () => {
  const files = [
    'src/auth/login.ts', 'src/auth/login.test.ts',
    'src/db/repo.ts', 'src/db/repo.test.ts'
  ];
  const initial = TeamworkDecomposer.decompose('Build and audit', files);
  const sharded = TeamworkSharder.shardSmartClusters(initial, files, 'Build and audit', 8);

  const qas = sharded.filter(t => t.roleType === 'qa');
  assert.strictEqual(qas.length, 2);
  const qaLabels = qas.map(q => q.label);
  assert.ok(qaLabels.includes('Auth'));
  assert.ok(qaLabels.includes('Db'));
  assert.ok(qas.every(q => q.phase === 2));
});
