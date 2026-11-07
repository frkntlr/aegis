/**
 * @file teamwork-reflection.ts
 * Reflective evaluation, autonomous gap analysis, and self-correction feedback loop.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeMutex } from './worktree-mutex.js';
import { TeamworkMesh } from './teamwork-mesh.js';
import { TeamworkResearchSwarm } from './teamwork-research-swarm.js';
import type {
  ReflectionGap,
  ReflectionEvaluationResult,
  FollowUpTask,
  FeedbackLoopIterationResult,
  ReflectionLoopOptions,
  InboxTaskItem
} from './teamwork-reflection-types.js';

export * from './teamwork-reflection-types.js';

function readInboxTasks(repoRoot: string): InboxTaskItem[] {
  const p = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(raw)) return raw as InboxTaskItem[];
    if (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks)) {
      return (raw as { tasks: InboxTaskItem[] }).tasks;
    }
  } catch { /* ignore */ }
  return [];
}

function writeInboxTasks(repoRoot: string, tasks: InboxTaskItem[]): void {
  const p = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { /* ignore */ }
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, p);
  } catch {
    fs.copyFileSync(tmp, p);
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

function filterPlanTasks(tasks: InboxTaskItem[], planId: string): InboxTaskItem[] {
  if (!tasks.length) return [];
  const matches = tasks.filter(t =>
    (t.trackId && t.trackId.startsWith(planId)) ||
    (t.title && t.title.includes(planId)) ||
    (t.prompt && t.prompt.includes(planId))
  );
  return matches.length > 0 ? matches : tasks;
}

function detectTaskGaps(repoRoot: string, tasks: InboxTaskItem[]): ReflectionGap[] {
  const gaps: ReflectionGap[] = [];
  let idx = 1;
  for (const t of tasks) {
    if (t.status === 'blocked') {
      gaps.push({
        id: `gap-${idx++}`, type: 'blocked_task', priority: 'high',
        description: `Task #${t.issueNumber} "${t.title}" is blocked. Needs remediation.`,
        suggestedRole: t.role || 'issue-solver [Remediation]',
        targetFiles: t.targetFiles ?? []
      });
    }
    const cleanFiles = (t.targetFiles ?? []).map(f => f.split('#')[0].trim()).filter(Boolean);
    for (const f of cleanFiles) {
      if (!fs.existsSync(path.resolve(repoRoot, f))) {
        gaps.push({
          id: `gap-${idx++}`, type: 'missing_target', priority: 'high',
          description: `Target file "${f}" for task #${t.issueNumber} does not exist on disk.`,
          suggestedRole: 'issue-solver [Implementer]', targetFiles: [f]
        });
      }
    }
  }
  return gaps;
}

function detectEcosystemGaps(repoRoot: string, tasks: InboxTaskItem[], objective: string, startIdx: number): ReflectionGap[] {
  const gaps: ReflectionGap[] = [];
  let idx = startIdx;
  const codeFiles = tasks.flatMap(t => (t.targetFiles ?? []).map(f => f.split('#')[0].trim()))
    .filter(f => /\.(ts|js|gd|cs)$/.test(f) && !/\.(test|spec)\./.test(f));

  for (const cf of Array.from(new Set(codeFiles))) {
    const ext = path.extname(cf);
    const base = cf.slice(0, -ext.length);
    const testFile = `${base}.test${ext}`;
    if (!fs.existsSync(path.resolve(repoRoot, testFile)) && !fs.existsSync(path.resolve(repoRoot, `${base}.spec${ext}`))) {
      gaps.push({
        id: `gap-${idx++}`, type: 'missing_tests', priority: 'medium',
        description: `Source code file "${cf}" has no corresponding unit test suite.`,
        suggestedRole: 'qa-hunter [Test-Engineer]', targetFiles: [testFile]
      });
    }
  }
  if (TeamworkResearchSwarm.isResearchRequested(objective) && !fs.existsSync(path.resolve(repoRoot, 'docs/research/reflective-investigation.md'))) {
    gaps.push({
      id: `gap-${idx++}`, type: 'research_needed', priority: 'medium',
      description: `Objective requires deep architectural research but no research artifact found.`,
      suggestedRole: 'doc-architect [NLM-Researcher]', targetFiles: ['docs/research/reflective-investigation.md']
    });
  }
  return gaps;
}

function buildCorrectionPrompt(gap: ReflectionGap, issueNum: number, planId: string): string {
  return [
    `🛠️ [SELF-CORRECTION] AKTİF | ${gap.suggestedRole}`,
    `## Assigned Corrective Subagent Task #${issueNum}`,
    `**Plan**: ${planId} | **Priority**: ${gap.priority.toUpperCase()}`,
    `**Objective**: ${gap.description}`,
    `**Target Files**: ${gap.targetFiles.join(', ') || 'Codebase targets'}`,
    '',
    '### Rules & Invariants',
    '1. Demir Kafes: <300 lines/file, <40 lines/function, 0 any.',
    '2. Surgical diffs: Modify or create only necessary code without side effects.',
    '3. Validation: Verify implementation with test execution before reporting back.',
    `4. Post completion to mesh and notify Team Lead with [ROLE_COMPLETE: ${gap.suggestedRole}].`
  ].join('\n');
}

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
    const gaps = [...taskGaps, ...ecoGaps];

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    const blockedTasks = tasks.filter(t => t.status === 'blocked').length;

    const baseScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : (gaps.length === 0 ? 100 : 50);
    const penalty = gaps.reduce((acc, g) => acc + (g.priority === 'high' ? 20 : g.priority === 'medium' ? 10 : 5), 0);
    const score = Math.max(0, Math.min(100, Math.round(baseScore - penalty)));
    const isComplete = gaps.length === 0 && (totalTasks === 0 || completedTasks === totalTasks);

    const recommendations = gaps.map(g => `[${g.priority.toUpperCase()}] ${g.suggestedRole}: ${g.description}`);
    if (recommendations.length === 0) recommendations.push('All criteria and tasks satisfied. Ready for final merge.');

    return {
      planId: effectivePlanId, objective, isComplete, score, totalTasks,
      completedTasks, pendingTasks, blockedTasks, gaps, recommendations,
      evaluatedAt: new Date().toISOString()
    };
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

      const followUpTasks: FollowUpTask[] = gaps.map((gap, idx) => {
        const issueNum = maxId + idx + 1;
        const worktree = gap.suggestedRole.includes('qa') ? 'experimental/qa'
          : (gap.suggestedRole.includes('doc') ? 'experimental/docs' : 'experimental/solver');
        return {
          id: issueNum, issueNumber: issueNum, title: `[Self-Correction] ${gap.description}`,
          role: gap.suggestedRole, worktree, targetFiles: gap.targetFiles,
          acceptanceCriteria: [`Resolve gap: ${gap.description}`, 'Adhere to Demir Kafes', 'Verify with test execution'],
          prompt: buildCorrectionPrompt(gap, issueNum, effectivePlanId),
          status: 'pending', dependsOn: [], phase: nextWave, stagedAt: new Date().toISOString(),
          trackId: `${effectivePlanId}-corr-${idx + 1}`
        };
      });

      writeInboxTasks(this.repoRoot, [...existing, ...followUpTasks]);
      this.mesh.broadcastEvent('reflection-engine', `Injected ${followUpTasks.length} follow-up task(s) for self-correction.`, 'milestone', {
        planId: effectivePlanId, injectedCount: followUpTasks.length
      });
      return followUpTasks;
    } finally {
      unlock();
    }
  }

  public runFeedbackLoop(planId?: string, options?: ReflectionLoopOptions): FeedbackLoopIterationResult {
    const evaluation = this.evaluateCompleteness(planId);
    if (!evaluation.isComplete || options?.forceIterate) {
      const followUpTasks = this.generateFollowUpTasks(evaluation.gaps, evaluation.planId);
      let waveAdv = false;
      let nextWave = this.mesh.getMeshState().activeWave;
      if (options?.autoAdvanceWave !== false) {
        const advRes = this.mesh.advanceWave(evaluation.planId);
        waveAdv = advRes.advanced;
        nextWave = advRes.nextWave;
      }
      return {
        iteration: nextWave, planId: evaluation.planId, evaluation, followUpTasks,
        stagedCount: followUpTasks.length, waveAdvanced: waveAdv, currentWave: nextWave,
        summary: `Reflective Feedback Loop (Wave ${nextWave}): Injected ${followUpTasks.length} corrective task(s). Wave advanced.`
      };
    }
    this.mesh.broadcastEvent('reflection-engine', 'Reflective evaluation passed 100% completeness. No follow-up needed.', 'completed');
    return {
      iteration: this.mesh.getMeshState().activeWave, planId: evaluation.planId, evaluation,
      followUpTasks: [], stagedCount: 0, waveAdvanced: false, currentWave: this.mesh.getMeshState().activeWave,
      summary: 'Reflective Feedback Loop: Mission fully complete (Score: 100%). No follow-up tasks required.'
    };
  }

  public formatReflectionReport(res: ReflectionEvaluationResult): string {
    const icon = res.isComplete ? '✅' : '⚠️';
    const lines: string[] = [
      `🔍 Aegis Reflective Evaluation Report [${res.planId}]`,
      ` • Objective: "${res.objective}"`,
      ` • Completeness Score: ${res.score}/100 ${icon} (${res.isComplete ? 'COMPLETE' : 'INCOMPLETE'})`,
      ` • Tasks: Total ${res.totalTasks} | Done ${res.completedTasks} | Pending ${res.pendingTasks} | Blocked ${res.blockedTasks}`,
      ''
    ];
    if (res.gaps.length > 0) {
      lines.push(`⚠️ Identified Gaps (${res.gaps.length}):`);
      for (const g of res.gaps) lines.push(` • [${g.priority.toUpperCase()}] (${g.type}) @${g.suggestedRole}: ${g.description}`);
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
      ''
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
