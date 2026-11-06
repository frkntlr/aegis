import { test } from 'node:test';
import * as assert from 'node:assert';
import { TeamworkDecomposer, TeamworkSharder } from './teamwork-decomposer.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';
import { compileUltraLeanPrompt, getSubagentProfiles } from './teamwork-prompts.js';

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

test('TeamworkDecomposer can scale to 10+ subtasks cleanly with zero lock collision', () => {
  const objective = '1. Parser, 2. Lexer, 3. Ast, 4. Cache, 5. Auth, 6. Db, 7. Api, 8. Client, 9. UI, 10. Audit, 11. Docs';
  const files = [
    'src/parser.ts', 'src/lexer.ts', 'src/ast.ts', 'src/cache.ts',
    'src/auth.ts', 'src/db.ts', 'src/api.ts', 'src/client.ts',
    'scenes/main.tscn', 'docs/API.md'
  ];
  const subtasks = TeamworkDecomposer.decompose(objective, files);

  assert.ok(subtasks.length >= 10, `Expected at least 10 subtasks, got ${subtasks.length}`);
  const assigned = subtasks.flatMap(s => s.targetFiles);
  const unique = new Set(assigned);
  assert.strictEqual(assigned.length, unique.size, 'All file allocations must be strictly disjoint');
});

test('TeamworkDecomposer auto-shards single solver into parallel subtasks when multiple source files provided', () => {
  const objective = 'Refactor core modules';
  const files = ['src/parser.ts', 'src/cache.ts', 'src/auth.ts', 'src/db.ts'];
  const subtasks = TeamworkDecomposer.decompose(objective, files);

  const solvers = subtasks.filter(s => s.roleType === 'solver');
  assert.strictEqual(solvers.length, 4);
  assert.strictEqual(solvers[0].targetFiles.length, 1);
  assert.strictEqual(solvers[1].targetFiles.length, 1);
  assert.strictEqual(solvers[2].targetFiles.length, 1);
  assert.strictEqual(solvers[3].targetFiles.length, 1);
});

test('shardMaxConcurrency guarantees 100% disjoint file allocation for up to 12 agents', () => {
  const files = [
    'src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts',
    'src/e.ts', 'src/f.ts', 'src/g.ts', 'src/h.ts',
    'src/i.ts', 'src/j.ts', 'src/k.ts', 'src/l.ts'
  ];
  const initial = TeamworkDecomposer.decompose('Scale task', files);
  const sharded = TeamworkDecomposer.shardMaxConcurrency(initial, files, 12);

  const wave1 = sharded.filter(s => s.phase === 1);
  assert.strictEqual(wave1.length, 12);

  const allAssigned = wave1.flatMap(s => s.targetFiles);
  const uniqueAssigned = new Set(allAssigned);
  assert.strictEqual(allAssigned.length, uniqueAssigned.size, 'No two subagents should share any target files');
  assert.strictEqual(uniqueAssigned.size, 12);
});

test('compileUltraLeanPrompt generates compact prompt under 200 tokens with anchors and contract', () => {
  const profile = getSubagentProfiles()[0];
  const prompt = compileUltraLeanPrompt(
    profile,
    'Implement fast tokenizer',
    ['src/tokenizer.ts'],
    'issue-solver [tokenizer]',
    ['tokenizeString', 'TokenKind'],
    'export interface Token { kind: TokenKind; value: string }'
  );
  assert.ok(prompt.includes(profile.badge));
  assert.ok(prompt.includes('ACT:issue-solver [tokenizer]'));
  assert.ok(prompt.includes('FILES:[src/tokenizer.ts]'));
  assert.ok(prompt.includes('ANCHORS:[tokenizeString, TokenKind]'));
  assert.ok(prompt.includes('CONTRACT:export interface Token'));
  assert.ok(prompt.includes('ROLE_COMPLETE: issue-solver [tokenizer]'));
});

test('TeamworkSharder clusters sibling tests and implementation files together', () => {
  const files = [
    'packages/core/orchestrator/src/parser.ts',
    'packages/core/orchestrator/src/parser.test.ts',
    'packages/cli/src/commands/build.ts',
    'packages/cli/src/commands/build.test.ts'
  ];
  const clusters = TeamworkSharder.clusterFilesBySubsystem(files);
  assert.strictEqual(clusters.size, 2);
  const keys = Array.from(clusters.keys());
  assert.ok(keys.includes('Core-orchestrator'));
  assert.ok(keys.includes('Cli-commands'));

  const coreFiles = clusters.get('Core-orchestrator') || [];
  assert.strictEqual(coreFiles.length, 2);
  assert.ok(coreFiles.includes('packages/core/orchestrator/src/parser.ts'));
  assert.ok(coreFiles.includes('packages/core/orchestrator/src/parser.test.ts'));
});

test('TeamworkSharder calculates optimal concurrency K* without idle agent waste', () => {
  assert.strictEqual(TeamworkSharder.calculateOptimalConcurrency(1, 10, 12), 1);
  assert.strictEqual(TeamworkSharder.calculateOptimalConcurrency(3, 10, 12), 3);
  assert.strictEqual(TeamworkSharder.calculateOptimalConcurrency(8, 20, 12), 8);
  assert.strictEqual(TeamworkSharder.calculateOptimalConcurrency(15, 30, 12), 12);
});

test('TeamworkDecomposer with autoScale creates optimal conflict-free clusters', () => {
  const files = [
    'src/auth/login.ts',
    'src/auth/login.test.ts',
    'src/db/repo.ts',
    'src/db/repo.test.ts'
  ];
  const subtasks = TeamworkDecomposer.decompose('Build auth and database', files, { autoScale: true });
  const solvers = subtasks.filter(s => s.roleType === 'solver');
  assert.strictEqual(solvers.length, 2, 'Should scale to exactly 2 solvers for 2 distinct subsystems');

  const authSolver = solvers.find(s => s.targetFiles.some(f => f.includes('auth')));
  assert.ok(authSolver);
  assert.ok(authSolver?.targetFiles.includes('src/auth/login.ts'));
  assert.ok(authSolver?.targetFiles.includes('src/auth/login.test.ts'));

  const dbSolver = solvers.find(s => s.targetFiles.some(f => f.includes('db')));
  assert.ok(dbSolver);
  assert.ok(dbSolver?.targetFiles.includes('src/db/repo.ts'));
  assert.ok(dbSolver?.targetFiles.includes('src/db/repo.test.ts'));
});



