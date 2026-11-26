import { test } from 'node:test';
import * as assert from 'node:assert';
import { TeamworkDecomposer, TeamworkSharder } from './teamwork-decomposer.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

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

test('TeamworkDecomposer supports selective role activation without forcing unneeded roles', () => {
  const qaOnly = TeamworkDecomposer.decompose('Sadece QA testlerini koştur', ['test/core.test.ts'], { explicitRole: 'qa' });
  assert.strictEqual(qaOnly.length, 1);
  assert.strictEqual(qaOnly[0].roleType, 'qa');

  const uiOnly = TeamworkDecomposer.decompose('UI menü temasını hazırla', ['res://menu.tscn'], { selectedRoles: ['ui'] });
  assert.strictEqual(uiOnly.length, 1);
  assert.strictEqual(uiOnly[0].roleType, 'ui');
});

test('TeamworkDecomposer expands 4 micro-specialists under single role for hierarchical tree request', () => {
  const objective = 'qa hunter altında 4 ajan ile tam sistem doğrulaması';
  const subtasks = TeamworkDecomposer.decompose(objective, ['test/game.test.ts', 'scenes/menu.tscn']);

  assert.strictEqual(subtasks.length, 4);
  const labels = subtasks.map(s => s.label);
  assert.deepStrictEqual(labels, ['Playtest', 'Layout', 'Cage', 'Mutation']);
  assert.ok(subtasks.every(s => s.roleType === 'qa'));
});

test('TeamworkCoordinator plans hierarchical tree tracks with specialized tools and disjoint locks', () => {
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork('qa hunter altında 4 ajan', ['test/game.test.ts', 'scenes/hud.tscn'], {
    treeSpecialists: true,
    explicitRole: 'qa'
  });

  assert.strictEqual(plan.tracks.length, 4);
  const playtestTrack = plan.tracks.find(t => t.subagentName.includes('[Playtest]'));
  const mutationTrack = plan.tracks.find(t => t.subagentName.includes('[Mutation]'));

  assert.ok(playtestTrack?.assignedAegisTools?.includes('aegis_godot_playtest'));
  assert.ok(mutationTrack?.assignedAegisTools?.includes('mutate'));
  assert.strictEqual(playtestTrack?.phase, 1);
  assert.strictEqual(mutationTrack?.phase, 1);
});

test('TeamworkDecomposer splits 2 comma items, short sentences, and Turkish conjunctions', () => {
  const commaItems = TeamworkDecomposer.splitObjective('auth servisini yap, login ekranını hazırla');
  assert.strictEqual(commaItems.length, 2);
  assert.strictEqual(commaItems[0], 'auth servisini yap');

  const shortSentences = TeamworkDecomposer.splitObjective('Fix bug. Add test.');
  assert.strictEqual(shortSentences.length, 2);

  const ileItems = TeamworkDecomposer.splitObjective('auth servisini yap ile login ekranını hazırla');
  assert.strictEqual(ileItems.length, 2);

  const veDeItems = TeamworkDecomposer.splitObjective('auth servisini yap ve de login ekranını hazırla');
  assert.strictEqual(veDeItems.length, 2);
});
