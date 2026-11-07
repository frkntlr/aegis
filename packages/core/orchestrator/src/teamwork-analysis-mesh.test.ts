import test from 'node:test';
import * as assert from 'node:assert';
import { TeamworkAnalysisMesh } from './teamwork-analysis-mesh.js';

test('TeamworkAnalysisMesh posts and queries insights with filters', () => {
  const mesh = new TeamworkAnalysisMesh(undefined, false);
  mesh.initSwarm('test-swarm', 'Testing Analysis Mesh');

  const ins1 = mesh.postInsight({
    lens: 'ast',
    agent: 'ast-architect',
    category: 'bottleneck',
    severity: 'high',
    target: 'src/parser.ts',
    finding: 'Approaching 300 lines'
  });

  const ins2 = mesh.postInsight({
    lens: 'triage',
    agent: 'triage-hunter',
    category: 'flaw',
    severity: 'critical',
    target: 'src/executor.ts',
    finding: 'Unhandled rejection'
  });

  assert.strictEqual(mesh.query().length, 2);
  assert.strictEqual(mesh.query({ lens: 'ast' }).length, 1);
  assert.strictEqual(mesh.query({ lens: 'ast' })[0].id, ins1.id);
  assert.strictEqual(mesh.query({ severity: 'critical' }).length, 1);
  assert.strictEqual(mesh.query({ severity: 'critical' })[0].id, ins2.id);
  assert.strictEqual(mesh.query({ target: 'parser' }).length, 1);
});

test('TeamworkAnalysisMesh tracks hotspots and clears state safely', () => {
  const mesh = new TeamworkAnalysisMesh(undefined, false);
  mesh.postInsight({
    lens: 'relation',
    agent: 'relational-mapper',
    category: 'coupling',
    severity: 'medium',
    target: 'src/hotspot.ts',
    finding: 'High coupling'
  });

  const hotspots = mesh.getHotspots();
  assert.ok(hotspots.includes('src/hotspot.ts'));

  mesh.clear();
  assert.strictEqual(mesh.query().length, 0);
  assert.strictEqual(mesh.getHotspots().length, 0);
});

test('TeamworkAnalysisMesh batch posts insights', () => {
  const mesh = new TeamworkAnalysisMesh(undefined, false);
  const results = mesh.batchPost([
    { lens: 'grounding', agent: 'grounder', category: 'contract', severity: 'info', target: 'docs/rfc.md', finding: 'RFC detected' },
    { lens: 'ast', agent: 'ast-architect', category: 'bottleneck', severity: 'low' as never, target: 'src/util.ts', finding: 'Minor' }
  ]);

  assert.strictEqual(results.length, 2);
  assert.strictEqual(mesh.query().length, 2);
});
