import { test } from 'node:test';
import assert from 'node:assert';
import { ArmoredPrescriptionBuilder } from './armored-prescription-builder.js';
import { DialogueEngine } from './dialogue-engine.js';
import { DiagnosticCategory, DialogueSession, TurnPhase } from './types.js';
import { ITaskDispatcher, TaskDispatchResult } from './ports/task-dispatcher.js';

class MockLockedDispatcher implements ITaskDispatcher {
  async checkLocks(_files: string[]): Promise<{ isAvailable: boolean; lockedFiles: string[] }> {
    return { isAvailable: false, lockedFiles: ['src/locked.ts'] };
  }
  async dispatchTask(_content: string, _opt: { targetWorktree: string; lockLabels: string[] }): Promise<TaskDispatchResult> {
    return { success: false, targetWorktree: 'solver', lockLabels: [], isLockedByOther: true, message: 'Locked' };
  }
}

test('ArmoredPrescriptionBuilder builds standard plan with micro-probe command', async () => {
  const session: DialogueSession = {
    sessionId: 'test-session-1',
    phase: TurnPhase.TURN_2_CLARIFICATION,
    turnCount: 2,
    category: DiagnosticCategory.PERFORMANCE,
    availableOptions: [],
    history: [],
    isResolved: false,
    evidence: {
      filePath: 'packages/core/timer.ts',
      lineNumber: 50,
      cleanedLog: 'Error log',
      confidenceScore: 0.95,
      needsClarification: false
    }
  };

  const option = {
    id: 'hyp-1',
    label: 'Timer overflow',
    hypothesisKey: 'TIMER_OVERFLOW',
    microProbeCommand: 'npm test -- -t "timer"'
  };

  const plan = await ArmoredPrescriptionBuilder.buildPlan(session, option);
  assert.strictEqual(plan.targetWorktree, 'experimental/solver');
  assert.deepStrictEqual(plan.lockLabels, ['packages/core/timer.ts']);
  assert.strictEqual(plan.mustDecompose, false);
  assert.ok(plan.steps.some(s => s.includes('npm test -- -t "timer"')));
});

test('ArmoredPrescriptionBuilder triggers decomposition when line budget is low', async () => {
  const session: DialogueSession = {
    sessionId: 'test-session-2',
    phase: TurnPhase.TURN_2_CLARIFICATION,
    turnCount: 2,
    category: DiagnosticCategory.CAGE_VIOLATION,
    availableOptions: [],
    history: [],
    isResolved: false,
    evidence: {
      filePath: 'packages/core/big-module.ts',
      lineNumber: 290,
      cleanedLog: 'Error',
      confidenceScore: 0.9,
      needsClarification: false
    },
    budgetReport: {
      filePath: 'packages/core/big-module.ts',
      currentLines: 288,
      maxLines: 300,
      remainingLines: 12,
      mustDecompose: true
    }
  };

  const option = {
    id: 'hyp-budget',
    label: 'Line limit overflow',
    hypothesisKey: 'LINE_BUDGET_OVERFLOW'
  };

  const plan = await ArmoredPrescriptionBuilder.buildPlan(session, option);
  assert.strictEqual(plan.mustDecompose, true);
  assert.ok(plan.steps[0].includes('Decompose subroutine in packages/core/big-module.ts to sibling helper module'));
});

test('ArmoredPrescriptionBuilder flags locked files from dispatcher', async () => {
  const session: DialogueSession = {
    sessionId: 'test-session-3',
    phase: TurnPhase.TURN_2_CLARIFICATION,
    turnCount: 2,
    category: DiagnosticCategory.GIT_COLLISION,
    availableOptions: [],
    history: [],
    isResolved: false,
    evidence: {
      filePath: 'src/locked.ts',
      cleanedLog: 'Error',
      confidenceScore: 0.9,
      needsClarification: false
    }
  };

  const option = {
    id: 'hyp-lock',
    label: 'Concurrent lock',
    hypothesisKey: 'ORPHAN_LOCK'
  };

  const plan = await ArmoredPrescriptionBuilder.buildPlan(session, option, new MockLockedDispatcher());
  assert.ok(plan.title.includes('[LOCKED by src/locked.ts]'));
});

test('ArmoredPrescriptionBuilder formatTask embeds folded skeleton and ambient types', () => {
  const plan = {
    title: 'Fix issue',
    rootCause: 'Root cause test',
    steps: ['Step 1'],
    acceptanceCriteria: ['Criteria 1'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['file.ts']
  };

  const slice = {
    symbolName: 'testFn',
    filePath: 'file.ts',
    startLine: 1,
    endLine: 10,
    foldedSkeleton: 'function testFn() { ... }',
    ambientTypes: ['type TestType = string;']
  };

  const formatted = ArmoredPrescriptionBuilder.formatTask(plan, 'sess-123', slice);
  assert.ok(formatted.includes('## 🧩 AST Code Context'));
  assert.ok(formatted.includes('function testFn() { ... }'));
  assert.ok(formatted.includes('## 📚 Ambient Types'));
  assert.ok(formatted.includes('- type TestType = string;'));
});

test('DialogueEngine end-to-end interactive exportTask incorporates armored context', async () => {
  const engine = new DialogueEngine({
    evidenceProvider: {
      async parseEvidence(raw: string) {
        return {
          filePath: 'src/worker.ts',
          lineNumber: 20,
          cleanedLog: raw,
          confidenceScore: 0.95,
          needsClarification: false
        };
      }
    },
    memoryResolver: {
      async resolveSlice(filePath: string, line?: number) {
        return {
          symbolName: 'doWork',
          filePath,
          startLine: line || 20,
          endLine: 40,
          foldedSkeleton: 'function doWork() { ... }',
          ambientTypes: ['interface WorkPayload']
        };
      }
    }
  });

  const session = await engine.startSessionWithEvidence('Error in src/worker.ts at line 20');
  assert.ok(session.availableOptions.length > 0);

  const optId = session.availableOptions[0].id;
  engine.chooseClarification(session.sessionId, optId);
  engine.confirmAndResolve(session.sessionId, true);

  const task = engine.exportTask(session.sessionId);
  assert.ok(task.includes('# 🎯 Task: Remediate'));
  assert.ok(task.includes('## 🧩 AST Code Context'));
  assert.ok(task.includes('function doWork() { ... }'));
  assert.ok(task.includes('interface WorkPayload'));
});
