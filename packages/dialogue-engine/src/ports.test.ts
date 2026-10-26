import { test } from 'node:test';
import assert from 'node:assert';
import { DialogueEngine } from './dialogue-engine.js';
import {
  IEvidenceProvider,
  IMemorySliceResolver,
  ILineBudgetInspector,
  ITaskDispatcher,
  ParsedEvidence,
  MemorySymbolSlice,
  LineBudgetReport,
  TaskDispatchResult
} from './ports/index.js';

class MockEvidenceProvider implements IEvidenceProvider {
  async parseEvidence(raw: string): Promise<ParsedEvidence> {
    return {
      filePath: 'src/core.ts',
      lineNumber: 42,
      columnNumber: 5,
      symbolName: 'executeAction',
      cleanedLog: raw.trim(),
      confidenceScore: 0.95,
      needsClarification: false
    };
  }
}

class MockMemoryResolver implements IMemorySliceResolver {
  async resolveSlice(filePath: string, line?: number, sym?: string): Promise<MemorySymbolSlice | null> {
    return {
      symbolName: sym || 'unknown',
      filePath,
      startLine: line || 1,
      endLine: (line || 1) + 20,
      foldedSkeleton: 'function executeAction() { ... }',
      ambientTypes: ['interface TaskPayload'],
      calleeSignatures: ['validate(p: TaskPayload): boolean'],
      upstreamCallers: ['main.ts'],
      context7Doc: 'Official TypeScript documentation'
    };
  }
}

class MockBudgetInspector implements ILineBudgetInspector {
  async inspectBudget(filePath: string): Promise<LineBudgetReport> {
    return {
      filePath,
      currentLines: 285,
      maxLines: 300,
      remainingLines: 15,
      recommendation: 'Refactor into subroutine',
      mustDecompose: false
    };
  }
}

class MockTaskDispatcher implements ITaskDispatcher {
  async checkLocks(_files: string[]): Promise<{ isAvailable: boolean; lockedFiles: string[] }> {
    return { isAvailable: true, lockedFiles: [] };
  }
  async dispatchTask(_content: string, options: { targetWorktree: string; lockLabels: string[] }): Promise<TaskDispatchResult> {
    return {
      success: true,
      taskId: 'task-test-1',
      targetWorktree: options.targetWorktree,
      lockLabels: options.lockLabels,
      isLockedByOther: false,
      message: 'Dispatched successfully'
    };
  }
}

test('DialogueEngine initializes with ports and retrieves them', () => {
  const ports = {
    evidenceProvider: new MockEvidenceProvider(),
    memoryResolver: new MockMemoryResolver(),
    budgetInspector: new MockBudgetInspector(),
    taskDispatcher: new MockTaskDispatcher()
  };
  const engine = new DialogueEngine(ports);
  assert.strictEqual(engine.getPorts(), ports);
});

test('startSessionWithEvidence populates session with evidence, slice, and budget', async () => {
  const engine = new DialogueEngine({
    evidenceProvider: new MockEvidenceProvider(),
    memoryResolver: new MockMemoryResolver(),
    budgetInspector: new MockBudgetInspector()
  });

  const session = await engine.startSessionWithEvidence('Error in src/core.ts at line 42: crash');
  assert.ok(session.sessionId);
  assert.strictEqual(session.turnCount, 1);
  assert.strictEqual(session.evidence?.filePath, 'src/core.ts');
  assert.strictEqual(session.evidence?.lineNumber, 42);
  assert.strictEqual(session.memorySlice?.symbolName, 'executeAction');
  assert.strictEqual(session.memorySlice?.foldedSkeleton, 'function executeAction() { ... }');
  assert.strictEqual(session.budgetReport?.currentLines, 285);
  assert.strictEqual(session.budgetReport?.remainingLines, 15);
});

test('startSessionWithEvidence works gracefully without optional ports', async () => {
  const engine = new DialogueEngine();
  const session = await engine.startSessionWithEvidence('Generic timeout error');
  assert.ok(session.sessionId);
  assert.strictEqual(session.evidence, undefined);
  assert.strictEqual(session.memorySlice, undefined);
  assert.strictEqual(session.budgetReport, undefined);
  assert.strictEqual(session.turnCount, 1);
});
