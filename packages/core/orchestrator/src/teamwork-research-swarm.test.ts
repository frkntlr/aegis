import test from 'node:test';
import * as assert from 'node:assert';
import { TeamworkResearchSwarm } from './teamwork-research-swarm.js';

test('TeamworkResearchSwarm detects research intent from keywords', () => {
  assert.strictEqual(TeamworkResearchSwarm.isResearchRequested('Mimarisi üzerine derin araştırma yap'), true);
  assert.strictEqual(TeamworkResearchSwarm.isResearchRequested('Deep research and architectural grounding'), true);
  assert.strictEqual(TeamworkResearchSwarm.isResearchRequested('Perform codebase investigation'), true);
  assert.strictEqual(TeamworkResearchSwarm.isResearchRequested('Fix simple typo in index.ts'), false);
});

test('TeamworkResearchSwarm builds 4 Phase 0 research tracks with disjoint artifacts', () => {
  const tracks = TeamworkResearchSwarm.buildResearchTracks('Orchestration Swarm', 'tw-test-res');
  assert.strictEqual(tracks.length, 4);

  for (const t of tracks) {
    assert.strictEqual(t.phase, 0);
    assert.ok(t.targetFiles.length > 0);
    assert.ok(t.assignedAegisTools && t.assignedAegisTools.length > 0);
    assert.strictEqual(t.invocationPayload.Workspace, 'share');
  }

  const artifacts = tracks.flatMap(t => t.targetFiles);
  const uniqueArtifacts = new Set(artifacts);
  assert.strictEqual(artifacts.length, uniqueArtifacts.size, 'All research output artifacts must be disjoint');

  const names = tracks.map(t => t.subagentName);
  assert.ok(names.includes('doc-architect [NLM-Researcher]'));
  assert.ok(names.includes('doc-architect [Wiki-Architect]'));
  assert.ok(names.includes('issue-solver [AST-Explorer]'));
  assert.ok(names.includes('qa-hunter [Triage-Auditor]'));
});
