/**
 * @file teamwork-reflection-helpers.ts
 * Leaf helpers for reading/writing task inbox and detecting reflection gaps.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, readJsonSafe } from '@aegis/shared';
import type {
  FollowUpTask,
  InboxTaskItem,
  ReflectionEvaluationResult,
  ReflectionGap,
} from './teamwork-reflection-types.js';
import { TeamworkResearchSwarm } from './teamwork-research-swarm.js';

export function readInboxTasks(repoRoot: string): InboxTaskItem[] {
  const p = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  if (!fs.existsSync(p)) return [];
  try {
    const raw = readJsonSafe<unknown>(p);
    if (Array.isArray(raw)) return raw as InboxTaskItem[];
    if (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks)) {
      return (raw as { tasks: InboxTaskItem[] }).tasks;
    }
  } catch (err: unknown) {
    debugLogIgnored('TeamworkReflection:readInboxTasks', err);
  }
  return [];
}

export function writeInboxTasks(repoRoot: string, tasks: InboxTaskItem[]): void {
  const p = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (err: unknown) {
    debugLogIgnored('TeamworkReflection:mkdirInbox', err);
  }
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf8');
  try {
    try {
      fs.renameSync(tmp, p);
    } catch (renameErr: unknown) {
      debugLogIgnored('TeamworkReflection:renameTmp', renameErr);
      fs.copyFileSync(tmp, p);
    }
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    } catch (cleanupErr: unknown) {
      debugLogIgnored('TeamworkReflection:cleanupTmp', cleanupErr);
    }
  }
}

export function filterPlanTasks(tasks: InboxTaskItem[], planId: string): InboxTaskItem[] {
  if (!tasks.length) return [];
  const matches = tasks.filter(
    (t) =>
      (t.trackId && t.trackId.startsWith(planId)) ||
      (t.title && t.title.includes(planId)) ||
      (t.prompt && t.prompt.includes(planId)),
  );
  return matches.length > 0 ? matches : tasks;
}

export function detectTaskGaps(repoRoot: string, tasks: InboxTaskItem[]): ReflectionGap[] {
  const gaps: ReflectionGap[] = [];
  let idx = 1;
  for (const t of tasks) {
    if (t.status === 'blocked') {
      gaps.push({
        id: `gap-${idx++}`,
        type: 'blocked_task',
        priority: 'high',
        description: `Task #${t.issueNumber} "${t.title}" is blocked. Needs remediation.`,
        suggestedRole: t.role || 'issue-solver [Remediation]',
        targetFiles: t.targetFiles ?? [],
      });
    }
    const cleanFiles = (t.targetFiles ?? []).map((f) => f.split('#')[0].trim()).filter(Boolean);
    for (const f of cleanFiles) {
      if (!fs.existsSync(path.resolve(repoRoot, f))) {
        gaps.push({
          id: `gap-${idx++}`,
          type: 'missing_target',
          priority: 'high',
          description: `Target file "${f}" for task #${t.issueNumber} does not exist on disk.`,
          suggestedRole: 'issue-solver [Implementer]',
          targetFiles: [f],
        });
      }
    }
  }
  return gaps;
}

function detectMissingTestGaps(
  repoRoot: string,
  tasks: InboxTaskItem[],
  startIdx: number,
): ReflectionGap[] {
  const gaps: ReflectionGap[] = [];
  let idx = startIdx;
  const codeFiles = tasks
    .flatMap((t) => (t.targetFiles ?? []).map((f) => f.split('#')[0].trim()))
    .filter((f) => /\.(ts|js|gd|cs)$/.test(f) && !/\.(test|spec)\./.test(f));

  for (const cf of Array.from(new Set(codeFiles))) {
    const ext = path.extname(cf);
    const base = cf.slice(0, -ext.length);
    const testFile = `${base}.test${ext}`;
    if (
      !fs.existsSync(path.resolve(repoRoot, testFile)) &&
      !fs.existsSync(path.resolve(repoRoot, `${base}.spec${ext}`))
    ) {
      gaps.push({
        id: `gap-${idx++}`,
        type: 'missing_tests',
        priority: 'medium',
        description: `Source code file "${cf}" has no corresponding unit test suite.`,
        suggestedRole: 'qa-hunter [Test-Engineer]',
        targetFiles: [testFile],
      });
    }
  }
  return gaps;
}

export function detectEcosystemGaps(
  repoRoot: string,
  tasks: InboxTaskItem[],
  objective: string,
  startIdx: number,
): ReflectionGap[] {
  const gaps = detectMissingTestGaps(repoRoot, tasks, startIdx);
  if (
    TeamworkResearchSwarm.isResearchRequested(objective) &&
    !fs.existsSync(path.resolve(repoRoot, 'docs/research/reflective-investigation.md'))
  ) {
    gaps.push({
      id: `gap-${startIdx + gaps.length}`,
      type: 'research_needed',
      priority: 'medium',
      description: 'Objective requires deep architectural research but no research artifact found.',
      suggestedRole: 'doc-architect [NLM-Researcher]',
      targetFiles: ['docs/research/reflective-investigation.md'],
    });
  }
  return gaps;
}

export function buildCorrectionPrompt(gap: ReflectionGap, issueNum: number, planId: string): string {
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
    `4. Post completion to mesh and notify Team Lead with [ROLE_COMPLETE: ${gap.suggestedRole}].`,
  ].join('\n');
}

export function buildEvaluationSummary(
  planId: string,
  objective: string,
  tasks: InboxTaskItem[],
  gaps: ReflectionGap[],
): ReflectionEvaluationResult {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const pendingTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').length;
  const baseScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : gaps.length === 0 ? 100 : 50;
  const penalty = gaps.reduce((acc, g) => acc + (g.priority === 'high' ? 20 : g.priority === 'medium' ? 10 : 5), 0);
  const score = Math.max(0, Math.min(100, Math.round(baseScore - penalty)));
  const isComplete = gaps.length === 0 && (totalTasks === 0 || completedTasks === totalTasks);
  const recommendations = gaps.map((g) => `[${g.priority.toUpperCase()}] ${g.suggestedRole}: ${g.description}`);
  if (recommendations.length === 0) {
    recommendations.push('All criteria and tasks satisfied. Ready for final merge.');
  }
  return {
    planId, objective, isComplete, score, totalTasks,
    completedTasks, pendingTasks, blockedTasks, gaps, recommendations,
    evaluatedAt: new Date().toISOString(),
  };
}

export function buildFollowUpTaskItem(
  gap: ReflectionGap,
  issueNum: number,
  nextWave: number,
  planId: string,
  idx: number,
): FollowUpTask {
  const worktree = gap.suggestedRole.includes('qa')
    ? 'experimental/qa'
    : gap.suggestedRole.includes('doc') ? 'experimental/docs' : 'experimental/solver';
  return {
    id: issueNum,
    issueNumber: issueNum,
    title: `[Self-Correction] ${gap.description}`,
    role: gap.suggestedRole,
    worktree,
    targetFiles: gap.targetFiles,
    acceptanceCriteria: [`Resolve gap: ${gap.description}`, 'Adhere to Demir Kafes', 'Verify with test execution'],
    prompt: buildCorrectionPrompt(gap, issueNum, planId),
    status: 'pending',
    dependsOn: [],
    phase: nextWave,
    stagedAt: new Date().toISOString(),
    trackId: `${planId}-corr-${idx + 1}`,
  };
}
