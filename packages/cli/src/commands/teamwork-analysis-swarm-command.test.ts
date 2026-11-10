import test from 'node:test';
import * as assert from 'node:assert';
import { isolateTeamworkTestWorkspace } from './teamwork-test-workspace.js';
import {
  handleTeamworkAnalysisSwarm,
  mcpTeamworkAnalysisSwarm,
  mcpAnalysisMeshQuery,
  mcpAnalysisMeshPost
} from './teamwork-analysis-swarm-command.js';

isolateTeamworkTestWorkspace('analysis-swarm');

test('handleTeamworkAnalysisSwarm executes with JSON output', async () => {
  const originalLog = console.log;
  let logged = '';
  console.log = (msg: string) => { logged += msg; };

  try {
    await handleTeamworkAnalysisSwarm('Analyze test files', 'packages/cli/src/banner.ts', '--json');
    assert.ok(logged.includes('swarmId'));
    assert.ok(logged.includes('totalInsights'));
  } finally {
    console.log = originalLog;
  }
});

test('mcpTeamworkAnalysisSwarm returns structured JSON report', async () => {
  const res = await mcpTeamworkAnalysisSwarm({
    objective: 'Test MCP Swarm',
    files: ['packages/cli/src/banner.ts']
  });

  const parsed = JSON.parse(res);
  assert.ok(parsed.swarmId);
  assert.strictEqual(parsed.objective, 'Test MCP Swarm');
  assert.ok(Array.isArray(parsed.insights));
});

test('mcpAnalysisMeshPost and mcpAnalysisMeshQuery interact with shared working memory', () => {
  const postRes = mcpAnalysisMeshPost({
    lens: 'ast',
    agent: 'test-agent',
    category: 'bottleneck',
    severity: 'high',
    target: 'src/module.ts',
    finding: 'High cyclomatic complexity'
  });
  const parsedPost = JSON.parse(postRes);
  assert.strictEqual(parsedPost.target, 'src/module.ts');

  const queryRes = mcpAnalysisMeshQuery({ lens: 'ast' });
  const parsedQuery = JSON.parse(queryRes);
  assert.ok(parsedQuery.count >= 1);
});
