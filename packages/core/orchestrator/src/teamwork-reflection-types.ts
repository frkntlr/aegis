/**
 * @file teamwork-reflection-types.ts
 * Type definitions and contracts for Reflective Self-Correction Feedback Loop.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export type GapType =
  | 'blocked_task'
  | 'missing_target'
  | 'unmet_criteria'
  | 'missing_tests'
  | 'research_needed'
  | 'execution_gap';

export interface ReflectionGap {
  id: string;
  type: GapType;
  description: string;
  suggestedRole: string;
  targetFiles: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface ReflectionEvaluationResult {
  planId: string;
  objective: string;
  isComplete: boolean;
  score: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  gaps: ReflectionGap[];
  recommendations: string[];
  evaluatedAt: string;
}

export interface FollowUpTask {
  id: number;
  issueNumber: number;
  title: string;
  role: string;
  worktree: string;
  targetFiles: string[];
  acceptanceCriteria: string[];
  prompt: string;
  status: 'pending';
  dependsOn: string[];
  phase: number;
  stagedAt: string;
  trackId: string;
}

export interface FeedbackLoopIterationResult {
  iteration: number;
  planId: string;
  evaluation: ReflectionEvaluationResult;
  followUpTasks: FollowUpTask[];
  stagedCount: number;
  waveAdvanced: boolean;
  currentWave: number;
  summary: string;
}

export interface ReflectionLoopOptions {
  autoAdvanceWave?: boolean;
  forceIterate?: boolean;
}

export interface InboxTaskItem {
  id: number;
  issueNumber: number;
  title: string;
  role: string;
  worktree?: string;
  targetFiles?: string[];
  acceptanceCriteria?: string[];
  prompt?: string;
  status?: string;
  dependsOn?: string[];
  phase?: number;
  trackId?: string;
  stagedAt?: string;
}
