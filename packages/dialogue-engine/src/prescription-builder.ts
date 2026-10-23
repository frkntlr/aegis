import { DiagnosticCategory, PrescriptionPlan, ClarificationOption } from './types.js';

const DEFAULT_PLANS: Record<string, PrescriptionPlan> = {
  STAGNATION: {
    title: 'Resolve Adaptive Timeout Stagnation',
    rootCause: 'Process did not produce output for over 60 seconds during testing.',
    steps: ['Enable stream output chunking in test runner.', 'Inject heartbeat event in watch loop.'],
    acceptanceCriteria: ['Process watchdog resets timer upon stream chunk reception.', 'Unit test validates 60s stagnation termination triggers cleanly.'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/core/watchdog/src/watchdog.ts']
  },
  ORPHAN_LOCK: {
    title: 'Reclaim Orphaned Git Worktree Locks',
    rootCause: 'Dead session left persistent locks in .aegis/locks without releasing.',
    steps: ['Run aegis auto or invoke OrphanTaskReclaimer.', 'Clear stale lock references from active locks manifest.'],
    acceptanceCriteria: ['Active locks list decrements to 0 when agent disconnects.', 'Sibling worktrees resume execution immediately.'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/core/orchestrator/src/file-lock-manager.ts']
  },
  FUNCTION_OVERFLOW: {
    title: 'Refactor Function Exceeding 40-Line Iron Cage Limit',
    rootCause: 'Method length breached deterministic Demir Kafes boundary.',
    steps: ['Decompose monolithic handler into 2 focused subroutines.', 'Verify surgical diff format and run cage:check.'],
    acceptanceCriteria: ['All modified functions have <= 40 lines.', 'Existing unit tests pass with zero regression.'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/core/iron-cage/src/cage-validator.ts']
  }
};

export class PrescriptionBuilder {
  public static buildPlan(category: DiagnosticCategory, option: ClarificationOption): PrescriptionPlan {
    return DEFAULT_PLANS[option.hypothesisKey] || {
      title: 'Remediate ' + category + ' Issue',
      rootCause: 'Diagnosed ' + option.label + ' in 3-turn interactive triage.',
      steps: ['Apply surgical patch.', 'Execute local pre-commit verification.'],
      acceptanceCriteria: ['All tests pass.', 'Demir Kafes 100% compliant.'],
      targetWorktree: 'experimental/solver',
      lockLabels: ['src/index.ts']
    };
  }

  public static formatAegisTask(plan: PrescriptionPlan, sessionId: string): string {
    const lines = [
      `# 🎯 Task: ${plan.title}`,
      `Session: ${sessionId}`,
      `Target Worktree: ${plan.targetWorktree}`,
      `Locks: ${plan.lockLabels.join(', ')}`,
      '',
      '## Root Cause',
      plan.rootCause,
      '',
      '## Remediation Steps',
      ...plan.steps.map(s => `1. ${s}`),
      '',
      '## Acceptance Criteria',
      ...plan.acceptanceCriteria.map(a => `- [ ] ${a}`),
      '- [ ] Strict compliance with Demir Kafes (max 40 lines/fn, max 300 lines/file).'
    ];
    return lines.join('\n');
  }
}
