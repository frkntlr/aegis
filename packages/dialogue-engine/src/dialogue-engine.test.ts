import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  DialogueEngine,
  DialogueStateMachine,
  SymptomClassifier,
  TurnPhase,
  DiagnosticCategory
} from './index.js';
import { runSimulatedTriage } from './cli.js';

test('SymptomClassifier correctly tags categories based on keywords', () => {
  assert.equal(SymptomClassifier.classify('CPU high latency and timeout'), DiagnosticCategory.PERFORMANCE);
  assert.equal(SymptomClassifier.classify('Git worktree lock conflict detected'), DiagnosticCategory.GIT_COLLISION);
  assert.equal(SymptomClassifier.classify('Function exceeded line limit in cage check'), DiagnosticCategory.CAGE_VIOLATION);
  assert.equal(SymptomClassifier.classify('Godot UI buttons overlap on mobile aspect ratios'), DiagnosticCategory.GODOT_ENGINE);
  assert.equal(SymptomClassifier.classify('Godot gdscript file has layout clipping'), DiagnosticCategory.GODOT_ENGINE);
  assert.equal(SymptomClassifier.classify('Random unknown crash'), DiagnosticCategory.UNKNOWN);
});

test('DialogueStateMachine enforces deterministic 3-turn progression', () => {
  assert.equal(DialogueStateMachine.canTransition(TurnPhase.IDLE, TurnPhase.TURN_1_SYMPTOM), true);
  assert.equal(DialogueStateMachine.canTransition(TurnPhase.TURN_1_SYMPTOM, TurnPhase.TURN_2_CLARIFICATION), true);
  assert.equal(DialogueStateMachine.canTransition(TurnPhase.TURN_2_CLARIFICATION, TurnPhase.TURN_3_PRESCRIPTION), true);
  assert.equal(DialogueStateMachine.canTransition(TurnPhase.TURN_1_SYMPTOM, TurnPhase.COMPLETED), false);
  assert.equal(DialogueStateMachine.canTransition(TurnPhase.COMPLETED, TurnPhase.TURN_1_SYMPTOM), false);
});

test('DialogueEngine executes full 3-turn diagnostic dialogue', () => {
  const engine = new DialogueEngine();
  
  // Turn 1
  const session1 = engine.startSession('Detected git lock collision across worktree branches');
  assert.equal(session1.turnCount, 1);
  assert.equal(session1.phase, TurnPhase.TURN_1_SYMPTOM);
  assert.equal(session1.category, DiagnosticCategory.GIT_COLLISION);
  assert.equal(session1.availableOptions.length, 2);
  
  // Turn 2
  const chosenOption = session1.availableOptions[0];
  const session2 = engine.chooseClarification(session1.sessionId, chosenOption.id);
  assert.equal(session2.turnCount, 2);
  assert.equal(session2.phase, TurnPhase.TURN_2_CLARIFICATION);
  assert.ok(session2.prescription);
  assert.equal(session2.prescription.targetWorktree, 'experimental/solver');
  
  // Turn 3
  const session3 = engine.confirmAndResolve(session2.sessionId, true);
  assert.equal(session3.turnCount, 3);
  assert.equal(session3.phase, TurnPhase.COMPLETED);
  assert.equal(session3.isResolved, true);
  assert.equal(session3.history.length, 3);

  // Task Export
  const task = engine.exportTask(session3.sessionId);
  assert.ok(task.includes('Demir Kafes'));
  assert.ok(task.includes('Target Worktree: experimental/solver'));
});

test('DialogueEngine guards against invalid turn actions', () => {
  const engine = new DialogueEngine();
  const session = engine.startSession('Slow queries');
  
  assert.throws(() => {
    engine.chooseClarification(session.sessionId, 'non-existent-opt');
  }, /not valid/);

  assert.throws(() => {
    engine.confirmAndResolve(session.sessionId, true);
  }, /Invalid transition/);
});

test('runSimulatedTriage executes end-to-end simulated 3-turn triage', () => {
  const result = runSimulatedTriage('Iron cage line limit violation in function');
  assert.ok(result.includes('3-Turn Dialogue Session'));
  assert.ok(result.includes('RESOLVED: true'));
  assert.ok(result.includes('Acceptance Criteria'));
});

test('DialogueEngine handles Godot Engine diagnostic category and generates inspect task', () => {
  const engine = new DialogueEngine();
  const session1 = engine.startSession('Godot UI buttons overlap on mobile aspect ratios');
  assert.equal(session1.category, DiagnosticCategory.GODOT_ENGINE);
  assert.equal(session1.availableOptions.length, 2);

  const session2 = engine.chooseClarification(session1.sessionId, 'godot-1');
  assert.ok(session2.prescription);
  assert.equal(session2.prescription.targetWorktree, 'experimental/qa');
  assert.ok(session2.prescription.steps.some(s => s.includes('aegis godot inspect')));

  const session3 = engine.confirmAndResolve(session2.sessionId, true);
  assert.equal(session3.isResolved, true);
  const task = engine.exportTask(session3.sessionId);
  assert.ok(task.includes('aegis godot inspect'));
});
