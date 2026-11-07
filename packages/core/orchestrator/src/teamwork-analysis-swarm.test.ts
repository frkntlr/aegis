import test from 'node:test';
import * as assert from 'node:assert';
import { TeamworkAnalysisSwarm } from './teamwork-analysis-swarm.js';
import { TeamworkAnalysisMesh } from './teamwork-analysis-mesh.js';

test('TeamworkAnalysisSwarm runs 4 concurrent lenses and produces executive report', async () => {
  const mesh = new TeamworkAnalysisMesh(undefined, false);
  const swarm = new TeamworkAnalysisSwarm(undefined, mesh);

  const report = await swarm.runAnalysisSwarm('Optimize engine performance', [
    'packages/core/orchestrator/src/index.ts',
    'packages/core/orchestrator/src/fast-semantic-analyzer.ts'
  ]);

  assert.ok(report.swarmId.startsWith('swarm-'));
  assert.strictEqual(report.objective, 'Optimize engine performance');
  assert.ok(report.durationMs >= 0);
  assert.ok(Array.isArray(report.insights));
  assert.ok(Array.isArray(report.criticalRisks));
  assert.ok(Array.isArray(report.recommendedActions));
  assert.ok(report.recommendedActions.length > 0);
  assert.ok(report.executiveSummary.includes('Swarm completed in'));
});

test('TeamworkAnalysisSwarm formats markdown executive matrix', async () => {
  const mesh = new TeamworkAnalysisMesh(undefined, false);
  const swarm = new TeamworkAnalysisSwarm(undefined, mesh);

  const report = await swarm.runAnalysisSwarm('Refactor parser', [
    'packages/core/orchestrator/src/teamwork-coordinator.ts'
  ]);

  const matrix = swarm.formatExecutiveMatrix(report);
  assert.ok(matrix.includes('Aegis Collaborative Analysis Swarm Matrix'));
  assert.ok(matrix.includes('Refactor parser'));
  assert.ok(matrix.includes('| Lens / Rol | Kategori | Önem | Hedef | Teşhis & Eylem |'));
});
