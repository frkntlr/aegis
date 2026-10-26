import { PrescriptionPlan, DiagnosticCategory, ClarificationOption, DialogueSession } from './types.js';
import { ITaskDispatcher } from './ports/task-dispatcher.js';
import { MemorySymbolSlice } from './ports/memory-slice-resolver.js';

export class ArmoredPrescriptionBuilder {
  public static async buildPlan(
    session: DialogueSession,
    option: ClarificationOption,
    dispatcher?: ITaskDispatcher
  ): Promise<PrescriptionPlan> {
    const file = session.evidence?.filePath || 'src/index.ts';
    const remaining = session.budgetReport ? session.budgetReport.remainingLines : 50;
    const mustDecompose = session.budgetReport?.mustDecompose || remaining < 15;
    const worktree = resolveWorktree(session.category);
    const lockLabels = [file];

    let lockWarning = '';
    if (dispatcher) {
      const lockStatus = await dispatcher.checkLocks(lockLabels);
      if (!lockStatus.isAvailable) {
        lockWarning = `[LOCKED by ${lockStatus.lockedFiles.join(', ')}] `;
      }
    }

    const title = `${lockWarning}Remediate ${option.hypothesisKey}: ${option.label}`;
    const steps = buildSteps(file, option, mustDecompose);
    const criteria = buildCriteria(option, session.memorySlice);

    return {
      title,
      rootCause: `Diagnosed ${option.label} (Confidence: ${option.confidenceScore || 0.9}).`,
      steps,
      acceptanceCriteria: criteria,
      targetWorktree: worktree,
      lockLabels,
      mustDecompose,
      microProbeCommand: option.microProbeCommand
    };
  }

  public static formatTask(plan: PrescriptionPlan, sessionId: string, slice?: MemorySymbolSlice): string {
    const lines = [
      `# 🎯 Task: ${plan.title}`,
      `Session: ${sessionId}`,
      `Target Worktree: ${plan.targetWorktree}`,
      `Locks: ${plan.lockLabels.join(', ')}`,
      '',
      '## Root Cause',
      plan.rootCause,
      ''
    ];

    if (slice?.foldedSkeleton) {
      lines.push('## 🧩 AST Code Context', '```typescript', slice.foldedSkeleton, '```', '');
    }

    if (slice?.ambientTypes && slice.ambientTypes.length > 0) {
      lines.push('## 📚 Ambient Types', ...slice.ambientTypes.map(t => `- ${t}`), '');
    }

    lines.push(
      '## Remediation Steps',
      ...plan.steps.map(s => `1. ${s}`),
      '',
      '## Acceptance Criteria',
      ...plan.acceptanceCriteria.map(a => `- [ ] ${a}`),
      '- [ ] Strict compliance with Demir Kafes (max 40 lines/fn, max 300 lines/file).'
    );

    return lines.join('\n');
  }
}

function resolveWorktree(category: DiagnosticCategory): string {
  if (category === DiagnosticCategory.GODOT_ENGINE) return 'experimental/qa';
  return 'experimental/solver';
}

function buildSteps(file: string, option: ClarificationOption, mustDecompose: boolean): string[] {
  const steps: string[] = [];
  if (mustDecompose) {
    steps.push(
      `Decompose subroutine in ${file} to sibling helper module to free up Demir Kafes line budget.`,
      `Apply surgical fix for ${option.hypothesisKey} in the extracted subroutine.`
    );
  } else {
    steps.push(`Apply surgical unified patch for ${option.hypothesisKey} in ${file}.`);
  }

  if (option.microProbeCommand) {
    steps.push(`Execute micro-probe verification: '${option.microProbeCommand}'.`);
  }
  steps.push('Run cage:check and verify 100% Iron Cage compliance.');
  return steps;
}

function buildCriteria(option: ClarificationOption, slice?: MemorySymbolSlice): string[] {
  const criteria = [
    `Root defect for ${option.hypothesisKey} is resolved without regression.`
  ];
  if (option.microProbeCommand) {
    criteria.push(`Micro-probe command '${option.microProbeCommand}' passes cleanly.`);
  }
  if (slice?.calleeSignatures && slice.calleeSignatures.length > 0) {
    criteria.push(`Adheres to callee signatures: ${slice.calleeSignatures.join(', ')}.`);
  }
  return criteria;
}
