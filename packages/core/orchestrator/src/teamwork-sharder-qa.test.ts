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

test('TeamworkSharder.getSubsystemKey normalizes Windows backslashes and prefixes consistently', () => {
  assert.strictEqual(TeamworkSharder.getSubsystemKey('packages\\core\\orchestrator\\src\\parser.ts'), 'Core-orchestrator');
  assert.strictEqual(TeamworkSharder.getSubsystemKey('.\\packages\\core\\orchestrator\\src\\parser.test.ts'), 'Core-orchestrator');
  assert.strictEqual(TeamworkSharder.getSubsystemKey('C:\\repo\\packages\\core\\orchestrator\\src\\parser.ts'), 'Core-orchestrator');
  assert.strictEqual(TeamworkSharder.getSubsystemKey('packages\\core\\src\\parser.ts'), 'Core-parser');
  assert.strictEqual(TeamworkSharder.getSubsystemKey('packages\\core\\src\\parser.test.ts'), 'Core-parser');
  assert.strictEqual(TeamworkSharder.getSubsystemKey('src\\auth\\login.ts'), 'Auth');
  assert.strictEqual(TeamworkSharder.getSubsystemKey('.\\src\\auth\\login.test.ts'), 'Auth');
  assert.strictEqual(TeamworkSharder.getSubsystemKey('C:\\work\\src\\db\\repo.ts'), 'Db');
});

test('TeamworkSharder clusters Windows and POSIX paths together without duplicate or degraded clusters', () => {
  const files = [
    'packages\\core\\orchestrator\\src\\parser.ts',
    'packages/core/orchestrator/src/parser.test.ts',
    '.\\packages\\cli\\src\\commands\\build.ts',
    'packages/cli/src/commands/build.test.ts'
  ];
  const clusters = TeamworkSharder.clusterFilesBySubsystem(files);
  assert.strictEqual(clusters.size, 2);
  assert.ok(clusters.has('Core-orchestrator'));
  assert.ok(clusters.has('Cli-commands'));
  assert.strictEqual(clusters.get('Core-orchestrator')?.length, 2);
  assert.strictEqual(clusters.get('Cli-commands')?.length, 2);
});

test('shardSmartClusters guarantees disjoint file allocations across sharded agents with Windows paths', () => {
  const files = [
    'packages\\core\\src\\auth.ts',
    'packages\\core\\src\\auth.test.ts',
    'packages\\cli\\src\\command.ts',
    'packages\\cli\\src\\command.test.ts'
  ];
  const initial: DecomposedSubtask[] = [
    { roleType: 'solver', label: 'Core', title: 'Implement feature', targetFiles: [] },
    { roleType: 'qa', label: 'Audit', title: 'Audit feature', targetFiles: [] }
  ];
  const sharded = TeamworkSharder.shardSmartClusters(initial, files, 'Multi subsystem Windows task', 8);

  const solvers = sharded.filter(s => s.roleType === 'solver');
  assert.strictEqual(solvers.length, 2);
  const solverFiles = solvers.flatMap(s => s.targetFiles);
  const uniqueSolverFiles = new Set(solverFiles.map(f => f.replace(/\\/g, '/')));
  assert.strictEqual(solverFiles.length, uniqueSolverFiles.size, 'Solver target files must be strictly disjoint');
  assert.strictEqual(uniqueSolverFiles.size, 4);

  const qas = sharded.filter(s => s.roleType === 'qa');
  assert.strictEqual(qas.length, 2);
  const qaFiles = qas.flatMap(q => q.targetFiles);
  const uniqueQaFiles = new Set(qaFiles.map(f => f.replace(/\\/g, '/')));
  assert.strictEqual(qaFiles.length, uniqueQaFiles.size, 'QA target files must be strictly disjoint');
});
