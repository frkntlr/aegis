/**
 * @file teamwork-coordinator-facade.ts
 * Wave formatting, deliberation, reflection, and visualization delegates for TeamworkCoordinator.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { type SubagentProfile, getSubagentProfiles } from './teamwork-prompts.js';
import { TeamworkVisualizer } from './teamwork-visualizer.js';
import { computeExecutionWaves, formatParallelDispatchBriefing, formatCompactWaveBriefing } from './teamwork-waves.js';
import type { DeliberationOptions, DeliberationResult } from './teamwork-deliberation.js';
import type { FeedbackLoopIterationResult, ReflectionLoopOptions } from './teamwork-reflection.js';
import type { ExecutionWave, TeamworkPlan, TeamworkTrack } from './teamwork-types.js';
import {
  TeamworkCoordinatorEngines,
  type TeamworkCoordinatorOptions
} from './teamwork-coordinator-engines.js';

export class TeamworkCoordinatorFacade extends TeamworkCoordinatorEngines {
  private cachedProfiles?: SubagentProfile[];

  constructor(repoRootOrOptions?: string | TeamworkCoordinatorOptions) {
    super(repoRootOrOptions);
  }

  public computeWaves(tracks?: TeamworkTrack[]): ExecutionWave[] { return computeExecutionWaves(tracks ?? []); }
  public formatWaveBriefing(waves?: ExecutionWave[]): string { return formatParallelDispatchBriefing(waves ?? []); }
  public formatCompactWaveBriefing(waves?: ExecutionWave[]): string { return formatCompactWaveBriefing(waves ?? []); }

  public deliberate(objective: string, files: string[] = [], options?: DeliberationOptions): DeliberationResult {
    return this.deliberationEngine.deliberate(objective, files, options);
  }

  public runFeedbackLoop(planId?: string, options?: ReflectionLoopOptions): FeedbackLoopIterationResult {
    return this.reflectionEngine.runFeedbackLoop(planId, options);
  }

  public listProfiles(): SubagentProfile[] {
    if (!this.cachedProfiles) this.cachedProfiles = getSubagentProfiles();
    return this.cachedProfiles;
  }

  public formatLiveMatrix(
    plan: TeamworkPlan,
    statuses: Record<string, 'running' | 'done' | 'failed' | 'pending' | 'blocked'> = {}
  ): string {
    return TeamworkVisualizer.formatLiveMatrix(plan, statuses);
  }

  public formatAsciiDag(plan: TeamworkPlan): string {
    return TeamworkVisualizer.formatAsciiDag(plan);
  }
}
