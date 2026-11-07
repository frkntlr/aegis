/**
 * @file teamwork-deliberation.test.ts
 * Unit tests for Multi-Agent Deliberation, Blackboard Consensus, and Semantic AI Decomposition.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TeamworkDeliberationEngine,
  SemanticAIDecomposer,
  TeamworkCoordinator,
  TeamworkAnalysisMesh
} from './index.js';

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-delib-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test('SemanticAIDecomposer detects architectural domains accurately', () => {
  const domains1 = SemanticAIDecomposer.detectDomains('Implement state machine transition and mutex lock');
  assert.ok(domains1.includes('state_machine'));

  const domains2 = SemanticAIDecomposer.detectDomains('Create streaming data flow pipeline and mesh store');
  assert.ok(domains2.includes('data_flow'));

  const domains3 = SemanticAIDecomposer.detectDomains('Add CLI command router and MCP tool handlers', ['packages/cli/src/commands/test-command.ts']);
  assert.ok(domains3.includes('api_surface'));

  const domains4 = SemanticAIDecomposer.detectDomains('Audit Demir Kafes invariants and write unit tests', ['src/test.test.ts']);
  assert.ok(domains4.includes('validation_safety'));

  const domains5 = SemanticAIDecomposer.detectDomains('Design Godot theme HUD and live ASCII matrix table', ['src/ui/hud.tres']);
  assert.ok(domains5.includes('ui_presentation'));
});

test('SemanticAIDecomposer infers state machine transitions and data flow pipelines', () => {
  const domains = SemanticAIDecomposer.detectDomains('State machine pipeline and safety validation');
  const transitions = SemanticAIDecomposer.inferStateTransitions('State machine workflow', domains);
  const flows = SemanticAIDecomposer.inferDataFlows('Data pipeline', domains);

  assert.ok(transitions.length > 0);
  assert.ok(transitions.some(t => t.includes('->')));
  assert.ok(flows.length > 0);
  assert.ok(flows.some(f => f.includes('->') || f.includes('<->')));
});

test('SemanticAIDecomposer decomposes into complementary parallel subtasks with valid phases', () => {
  const items = SemanticAIDecomposer.decompose(
    'Implement state machine workflow and audit safety with docs',
    ['src/state-mutex.ts', 'src/test.test.ts', 'docs/spec.md']
  );

  assert.ok(items.length >= 2);
  const roles = items.map(i => i.role);
  assert.ok(roles.includes('solver') || roles.includes('qa'));

  // Foundation solver tasks must be Phase 1
  const foundation = items.filter(i => i.role === 'solver');
  for (const f of foundation) {
    assert.strictEqual(f.phase, 1);
    assert.strictEqual(f.dependsOn.length, 0);
  }

  // Safety / QA tasks must be Phase 2 and depend on foundation
  const qaTasks = items.filter(i => i.role === 'qa');
  for (const q of qaTasks) {
    assert.strictEqual(q.phase, 2);
    assert.ok(q.dependsOn.length >= 1);
  }

  const subtasks = SemanticAIDecomposer.toDecomposedSubtasks(items);
  assert.strictEqual(subtasks.length, items.length);
  assert.strictEqual(subtasks[0].roleType, items[0].role);
});

test('TeamworkDeliberationEngine conducts multi-agent deliberation and blackboard consensus', () => {
  const mesh = new TeamworkAnalysisMesh(testTmpDir, false);
  const engine = new TeamworkDeliberationEngine(testTmpDir, mesh);

  const result = engine.deliberate(
    'Autonomous subagent coordination and live state transition mesh',
    ['packages/core/orchestrator/src/teamwork-mesh.ts'],
    { roles: ['lead', 'solver', 'qa', 'docs'] }
  );

  assert.ok(result.deliberationId.startsWith('delib-'));
  assert.strictEqual(result.hypotheses.length, 4);
  assert.ok(result.critiques.length > 0);
  assert.ok(result.consensus.consensusScore >= 25 && result.consensus.consensusScore <= 100);
  assert.ok(['consensus_reached', 'converged', 'refined', 'stalemate'].includes(result.consensus.status));
  assert.ok(result.consensus.agreedStrategy.length > 10);
  assert.ok(result.consensus.resolvedTradeoffs.length >= 2);
  assert.ok(result.tasks.length > 0);
  assert.strictEqual(result.meshRecorded, true);
});

test('TeamworkDeliberationEngine records hypotheses and critiques into TeamworkAnalysisMesh', () => {
  const mesh = new TeamworkAnalysisMesh(testTmpDir, true);
  const engine = new TeamworkDeliberationEngine(testTmpDir, mesh);

  engine.deliberate('Integrate blackboard shared memory for subagent peer review', [], {
    roles: ['lead', 'solver', 'qa']
  });

  const relationInsights = mesh.query({ lens: 'relation' });
  const triageInsights = mesh.query({ lens: 'triage' });
  const groundingInsights = mesh.query({ lens: 'grounding' });

  assert.ok(relationInsights.length >= 3, 'Should record hypotheses under relation lens');
  assert.ok(triageInsights.length >= 1, 'Should record peer critiques under triage lens');
  assert.ok(groundingInsights.length >= 1, 'Should record consensus under grounding lens');

  const consensusInsight = groundingInsights.find(i => i.target === 'consensus');
  assert.ok(consensusInsight, 'Consensus insight should be present in mesh');
  assert.ok(consensusInsight.finding.includes('Consensus:'));
});

test('TeamworkCoordinator integrates deliberation engine seamlessly', () => {
  const coordinator = new TeamworkCoordinator(testTmpDir);
  assert.ok(coordinator.deliberationEngine instanceof TeamworkDeliberationEngine);
  assert.strictEqual(coordinator.getDeliberationEngine(), coordinator.deliberationEngine);

  const result = coordinator.deliberate('Semantic AI decomposition and blackboard deliberation');
  assert.ok(result.deliberationId);
  assert.ok(result.consensus.consensusScore > 0);

  const plan = coordinator.planTeamwork('Mission with deliberation enabled', [], {
    stage: false,
    acquireLocks: false,
    deliberate: true
  });
  assert.ok(plan.planId);
  assert.ok(plan.tracks.length > 0);
});

test('TeamworkDeliberationEngine formats readable terminal briefing', () => {
  const engine = new TeamworkDeliberationEngine(testTmpDir, new TeamworkAnalysisMesh(testTmpDir, false));
  const result = engine.deliberate('Refactor CLI architecture');
  const briefing = engine.formatDeliberationBriefing(result);

  assert.ok(briefing.includes('Multi-Agent Deliberation & Blackboard Consensus'));
  assert.ok(briefing.includes('Architectural Domains:'));
  assert.ok(briefing.includes('Inferred State Machine Transitions:'));
  assert.ok(briefing.includes('Inferred Data Flow Pipelines:'));
  assert.ok(briefing.includes('Peer Critiques:'));
  assert.ok(briefing.includes('Agreed Consensus Strategy:'));
  assert.ok(briefing.includes('Semantically Decomposed Tasks:'));
});
