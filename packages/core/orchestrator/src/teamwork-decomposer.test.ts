import { test } from 'node:test';
import * as assert from 'node:assert';
import { TeamworkDecomposer } from './teamwork-decomposer.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

test('TeamworkDecomposer splits numbered objective into separate subtasks', () => {
  const objective = '1. AST Parser optimize et, 2. Önbellek mekanizması kur, 3. Demir Kafes denetimi yap';
  const subtasks = TeamworkDecomposer.decompose(objective, ['src/parser.ts', 'src/cache.ts']);

  assert.strictEqual(subtasks.length, 3);
  const solvers = subtasks.filter(s => s.roleType === 'solver');
  const qas = subtasks.filter(s => s.roleType === 'qa');

  assert.strictEqual(solvers.length, 2);
  assert.strictEqual(qas.length, 1);
  assert.ok(solvers[0].targetFiles.includes('src/parser.ts'));
  assert.ok(solvers[1].targetFiles.includes('src/cache.ts'));
});

test('TeamworkDecomposer partitions files statically with zero file overlap across solvers', () => {
  const objective = 'Refactor core parser and implement redis cache layer';
  const files = ['src/parser.ts', 'src/ast.ts', 'src/cache.ts', 'src/redis.ts'];
  const subtasks = TeamworkDecomposer.decompose(objective, files);

  const solvers = subtasks.filter(s => s.roleType === 'solver');
  assert.ok(solvers.length >= 2);

  const allAssigned = solvers.flatMap(s => s.targetFiles);
  const uniqueAssigned = new Set(allAssigned);
  assert.strictEqual(allAssigned.length, uniqueAssigned.size, 'No file should be locked by more than 1 solver');
});

test('TeamworkCoordinator spawns multiple issue-solver tracks for multi-step goals', () => {
  const coordinator = new TeamworkCoordinator();
  const obj = '1. Develop database repository; 2. Add REST API endpoints; 3. Run audit suite';
  const plan = coordinator.planTeamwork(obj, ['src/repo.ts', 'src/api.ts']);

  const solverTracks = plan.tracks.filter(t => t.roleType === 'solver');
  assert.strictEqual(solverTracks.length, 2);

  assert.ok(solverTracks[0].subagentName.startsWith('issue-solver ['));
  assert.ok(solverTracks[1].subagentName.startsWith('issue-solver ['));
  assert.notStrictEqual(solverTracks[0].subagentName, solverTracks[1].subagentName);

  const qaTrack = plan.tracks.find(t => t.roleType === 'qa');
  assert.ok(qaTrack);
  assert.ok(qaTrack?.subagentName.startsWith('qa-hunter ['));
});

test('TeamworkCoordinator formats multi-instance live matrix with descriptive labels', () => {
  const coordinator = new TeamworkCoordinator();
  const obj = '1. AST Parser; 2. Cache Layer; 3. Security Audit';
  const plan = coordinator.planTeamwork(obj, ['src/parser.ts', 'src/cache.ts']);

  const matrix = coordinator.formatLiveMatrix(plan, {
    [plan.tracks[0].subagentName]: 'done',
    [plan.tracks[1].subagentName]: 'running'
  });

  assert.ok(matrix.includes('`issue-solver ['));
  assert.ok(matrix.includes('✅ Tamamlandı'));
  assert.ok(matrix.includes('🔄 Çalışıyor'));
});

test('TeamworkDecomposer assigns phased dependencies correctly (Solvers/UI -> QA -> Docs)', () => {
  const objective = '1. Parser implement et; 2. UI tema hazırla; 3. QA audit yap; 4. Dokümantasyon yaz';
  const subtasks = TeamworkDecomposer.decompose(objective, ['src/parser.ts', 'res://ui.tscn', 'docs/README.md']);

  const solvers = subtasks.filter(s => s.roleType === 'solver');
  const uis = subtasks.filter(s => s.roleType === 'ui');
  const qas = subtasks.filter(s => s.roleType === 'qa');
  const docs = subtasks.filter(s => s.roleType === 'docs');

  assert.strictEqual(solvers[0].phase, 1);
  assert.strictEqual(uis[0].phase, 1);
  assert.strictEqual(qas[0].phase, 2);
  assert.strictEqual(docs[0].phase, 3);

  assert.ok(qas[0].dependsOn && qas[0].dependsOn.includes(solvers[0].label));
  assert.ok(qas[0].dependsOn && qas[0].dependsOn.includes(uis[0].label));
  assert.ok(docs[0].dependsOn && docs[0].dependsOn.includes(qas[0].label));
});
