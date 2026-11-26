/**
 * @file teamwork-coordinator.ts
 * Coordinates Antigravity subagent teams, task tracks, locks, and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { debugLogIgnored } from '@aegis/shared';
import {
  clearStagedInboxHelper,
  countPendingInboxHelper,
  exportSubagentManifestHelper
} from './teamwork-staging.js';
import type { WaveStatus } from './teamwork-mesh.js';
import type { PlanTeamworkOptions, TeamworkPlan, TeamworkStatusReport } from './teamwork-types.js';
import type { TeamworkCoordinatorOptions } from './teamwork-coordinator-engines.js';
import { TeamworkCoordinatorFacade } from './teamwork-coordinator-facade.js';
import { executePlanTeamwork } from './teamwork-coordinator-plan.js';

export * from './teamwork-types.js';
export type { TeamworkCoordinatorOptions } from './teamwork-coordinator-engines.js';
export { TeamworkVisualizer } from './teamwork-visualizer.js';
export { TeamworkGroundingEngine } from './teamwork-grounding.js';
export { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
export { TeamworkCompactEngine } from './teamwork-compact.js';
export { TeamworkMesh } from './teamwork-mesh.js';
export { TaskComplexityAnalyzer } from './task-complexity-analyzer.js';
export { TeamworkResearchSwarm } from './teamwork-research-swarm.js';
export { TeamworkAnalysisSwarm } from './teamwork-analysis-swarm.js';
export { TeamworkDeliberationEngine } from './teamwork-deliberation.js';
export { SemanticAIDecomposer } from './semantic-ai-decomposer.js';
export { TeamworkReflectionEngine } from './teamwork-reflection.js';
export { ProjectBootstrapEngine, type BootstrapResult, type BootstrapOptions } from './project-bootstrap.js';

export class TeamworkCoordinator extends TeamworkCoordinatorFacade {
  constructor(repoRootOrOptions?: string | TeamworkCoordinatorOptions) {
    super(repoRootOrOptions);
  }

  public planTeamwork(objective: string, targetFiles: string[] = [], options: PlanTeamworkOptions = {}): TeamworkPlan {
    return executePlanTeamwork(this, objective, targetFiles, options);
  }

  public compactTeamwork(plan?: TeamworkPlan): string {
    const activePlan = plan ?? this.planTeamwork('Active Mission');
    const status = this.getTeamworkStatus();
    this.compactEngine.compactInbox(this.repoRoot);
    return this.compactEngine.generateCompactBriefing(activePlan, status);
  }

  public exportSubagentManifest(outDir?: string): { count: number; manifestPath: string } {
    return exportSubagentManifestHelper(this.repoRoot, this.listProfiles(), outDir);
  }

  public advanceWave(planId?: string): {
    advanced: boolean;
    currentWave: number;
    nextPhase: string;
    nextBatchPayload: unknown[];
    status?: WaveStatus;
    readinessReport?: string;
  } {
    const meshRes = this.mesh.advanceWave(planId);
    const nextPhase = meshRes.nextWave === 2 ? 'QA Hunter Verification' : (meshRes.nextWave === 3 ? 'Living Architecture Synthesis' : 'Final Delivery');
    const nextBatchPayload = this.mesh.listPeers().filter(p => p.currentActivity.includes(`Wave ${meshRes.nextWave}`));
    return { advanced: meshRes.advanced, currentWave: meshRes.nextWave, nextPhase, nextBatchPayload, status: meshRes.status, readinessReport: meshRes.readinessReport };
  }

  public clearLocks(): number {
    return this.worktreeManager.clearAllLocks();
  }

  public clearTeamwork(): { locksCleared: number; tasksCleared: number } {
    const locksCleared = this.clearLocks();
    const tasksCleared = clearStagedInboxHelper(this.repoRoot);
    try { this.mesh.clearMesh(); } catch (err: unknown) { debugLogIgnored('TeamworkCoordinator:clearMesh', err); }
    return { locksCleared, tasksCleared };
  }

  public getTeamworkStatus(): TeamworkStatusReport {
    const locks: Record<string, string> = Object.fromEntries(this.worktreeManager.getLockedFiles().entries());
    const pendingCount = countPendingInboxHelper(this.repoRoot);
    return {
      activeTracksCount: pendingCount,
      lockedFilesCount: Object.keys(locks).length,
      pendingInboxCount: pendingCount,
      profiles: this.listProfiles(),
      locks
    };
  }
}

export function clearTeamwork(repoRoot?: string): { locksCleared: number; tasksCleared: number } {
  return new TeamworkCoordinator(repoRoot).clearTeamwork();
}

export function clearLocks(repoRoot?: string): number {
  return new TeamworkCoordinator(repoRoot).clearLocks();
}
