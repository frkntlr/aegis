/**
 * @file teamwork-reflection.ts
 * Reflective evaluation, autonomous gap analysis, and self-correction feedback loop.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { TeamworkMesh } from './teamwork-mesh.js';
import {
  buildEvaluationSummary,
  buildFollowUpTaskItem,
  detectEcosystemGaps,
  detectTaskGaps,
  filterPlanTasks,
  readInboxTasks,
  writeInboxTasks,
} from './teamwork-reflection-helpers.js';
import type {
  FeedbackLoopIterationResult,
  FollowUpTask,
  ReflectionEvaluationResult,
  ReflectionGap,
  ReflectionLoopOptions,
} from './teamwork-reflection-types.js';
import { WorktreeMutex } from './worktree-mutex.js';

export * from './teamwork-reflection-types.js';

export class TeamworkReflectionEngine {
  private repoRoot: string;
  private mesh: TeamworkMesh;

  constructor(repoRoot?: string, mesh?: TeamworkMesh) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.mesh = mesh ?? new TeamworkMesh(this.repoRoot);
  }

  public evaluateCompleteness(planId?: string): ReflectionEvaluationResult {
    const meshState = this.mesh.getMeshState();
    const effectivePlanId = planId || meshState.planId || 'tw-live';
    const objective = meshState.objective || 'Active Mission';
    const allTasks = readInboxTasks(this.repoRoot);
    const tasks = filterPlanTasks(allTasks, effectivePlanId);

    const taskGaps = detectTaskGaps(this.repoRoot, tasks);
    const ecoGaps = detectEcosystemGaps(this.repoRoot, tasks, objective, taskGaps.length + 1);
    return buildEvaluationSummary(effectivePlanId, objective, tasks, [...taskGaps, ...ecoGaps]);
  }

  public generateFollowUpTasks(gaps: ReflectionGap[], planId?: string): FollowUpTask[] {
    if (gaps.length === 0) return [];
    const effectivePlanId = planId || this.mesh.getMeshState().planId || 'tw-live';
    const inboxPath = path.resolve(this.repoRoot, '.aegis', 'task-inbox.json');
    const unlock = WorktreeMutex.acquire(inboxPath);
    try {
      const existing = readInboxTasks(this.repoRoot);
      const maxId = existing.reduce((max, t) => Math.max(max, t.issueNumber || t.id || 0), 1000);
      const nextWave = this.mesh.getMeshState().activeWave + 1;
      const followUpTasks = gaps.map((gap, idx) =>
        buildFollowUpTaskItem(gap, maxId + idx + 1, nextWave, effectivePlanId, idx),
      );
      writeInboxTasks(this.repoRoot, [...existing, ...followUpTasks]);
      this.mesh.broadcastEvent(
        'reflection-engine',
        `Injected ${followUpTasks.length} follow-up task(s) for self-correction.`,
        'milestone',
        { planId: effectivePlanId, injectedCount: followUpTasks.length },
      );
      return followUpTasks;
    } finally {
      unlock();
    }
  }

  public runFeedbackLoop(
    planId?: string,
    options?: ReflectionLoopOptions,
  ): FeedbackLoopIterationResult {
    const evaluation = this.evaluateCompleteness(planId);
    const activeWave = this.mesh.getMeshState().activeWave;
    if (!evaluation.isComplete || options?.forceIterate) {
      const followUpTasks = this.generateFollowUpTasks(evaluation.gaps, evaluation.planId);
      const adv = options?.autoAdvanceWave !== false ? this.mesh.advanceWave(evaluation.planId) : null;
      const nextWave = adv ? adv.nextWave : activeWave;
      return {
        iteration: nextWave, planId: evaluation.planId, evaluation, followUpTasks,
        stagedCount: followUpTasks.length, waveAdvanced: adv ? adv.advanced : false,
        currentWave: nextWave,
        summary: `Reflective Feedback Loop (Wave ${nextWave}): Injected ${followUpTasks.length} corrective task(s). Wave advanced.`,
      };
    }
    this.mesh.broadcastEvent('reflection-engine', 'Reflective evaluation passed 100% completeness. No follow-up needed.', 'completed');
    return {
      iteration: activeWave, planId: evaluation.planId, evaluation,
      followUpTasks: [], stagedCount: 0, waveAdvanced: false, currentWave: activeWave,
      summary: 'Reflective Feedback Loop: Mission fully complete (Score: 100%). No follow-up tasks required.',
    };
  }

  public formatReflectionReport(res: ReflectionEvaluationResult): string {
    const icon = res.isComplete ? '✅' : '⚠️';
    const lines: string[] = [
      `🔍 Aegis Reflective Evaluation Report [${res.planId}]`,
      ` • Objective: "${res.objective}"`,
      ` • Completeness Score: ${res.score}/100 ${icon} (${res.isComplete ? 'COMPLETE' : 'INCOMPLETE'})`,
      ` • Tasks: Total ${res.totalTasks} | Done ${res.completedTasks} | Pending ${res.pendingTasks} | Blocked ${res.blockedTasks}`,
      '',
    ];
    if (res.gaps.length > 0) {
      lines.push(`⚠️ Identified Gaps (${res.gaps.length}):`);
      for (const g of res.gaps) {
        lines.push(` • [${g.priority.toUpperCase()}] (${g.type}) @${g.suggestedRole}: ${g.description}`);
      }
      lines.push('', '💡 Actionable Recommendations:');
      for (const r of res.recommendations) lines.push(` • ${r}`);
    } else {
      lines.push('✅ No gaps or deficiencies found. All acceptance criteria and targets satisfied.');
    }
    return lines.join('\n');
  }

  public formatIterationReport(res: FeedbackLoopIterationResult): string {
    const lines: string[] = [
      `🔄 Aegis Reflective Self-Correction Feedback Loop [${res.planId}]`,
      ` • Current Wave: Wave ${res.currentWave} | Iteration: ${res.iteration}`,
      ` • Summary: ${res.summary}`,
      ` • New Follow-up Tasks Staged: ${res.stagedCount}`,
      '',
    ];
    if (res.followUpTasks.length > 0) {
      lines.push('📋 Staged Follow-Up Tasks:');
      for (const t of res.followUpTasks) {
        lines.push(` ▶ #${t.issueNumber} [@${t.role}]: "${t.title}" -> [${t.targetFiles.join(', ')}]`);
      }
    }
    return lines.join('\n');
  }
}
