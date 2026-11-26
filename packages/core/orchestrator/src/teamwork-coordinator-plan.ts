/**
 * @file teamwork-coordinator-plan.ts
 * Execution pipeline for TeamworkCoordinator.planTeamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { TeamworkDecomposer, type DecomposedSubtask } from './teamwork-decomposer.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { stageTracksIntoInboxHelper } from './teamwork-staging.js';
import { TaskComplexityAnalyzer, type ComplexityAnalysisResult } from './task-complexity-analyzer.js';
import { TeamworkResearchSwarm } from './teamwork-research-swarm.js';
import { TeamworkAnalysisSwarm } from './teamwork-analysis-swarm.js';
import {
  annotateCodexMission,
  buildCoordinatorTracks,
  buildDecomposeOptions,
  formatDeliberationSummary,
  resolveSemanticSubtasks
} from './teamwork-coordinator-helpers.js';
import type { PlanTeamworkOptions, TeamworkPlan, TeamworkTrack } from './teamwork-types.js';
import type { TeamworkCoordinatorFacade } from './teamwork-coordinator-facade.js';

function resolveSubtasks(
  objective: string,
  files: string[],
  complexity: ComplexityAnalysisResult,
  options: PlanTeamworkOptions = {}
): DecomposedSubtask[] {
  if (options.semantic || options.deliberate) {
    return resolveSemanticSubtasks(objective, files, complexity, options);
  }
  return TeamworkDecomposer.decompose(objective, files, buildDecomposeOptions(objective, complexity, options));
}

function assemblePlanTracks(
  coordinator: TeamworkCoordinatorFacade,
  objective: string,
  planId: string,
  subtasks: DecomposedSubtask[],
  options: PlanTeamworkOptions
): TeamworkTrack[] {
  const tracks = buildCoordinatorTracks(
    subtasks,
    coordinator.listProfiles(),
    options.deterministic === true,
    coordinator.groundingEngine
  );
  const includeResearch = options.research || TeamworkResearchSwarm.isResearchRequested(objective);
  const resTracks = includeResearch ? TeamworkResearchSwarm.buildResearchTracks(objective, planId) : [];
  const allTracks = [...resTracks, ...tracks];
  annotateCodexMission(allTracks, objective);
  return allTracks;
}

export function executePlanTeamwork(
  coordinator: TeamworkCoordinatorFacade,
  objective: string,
  targetFiles: string[] = [],
  options: PlanTeamworkOptions = {}
): TeamworkPlan {
  const shouldStage = options.stage ?? true;
  if (shouldStage) coordinator.ensureBootstrap();
  const files = targetFiles.length > 0 ? targetFiles : coordinator.semanticAnalyzer.analyze(objective).targetFiles;
  const delibResult = options.deliberate ? coordinator.deliberate(objective, files) : undefined;
  if (options.deepAnalyze || TeamworkAnalysisSwarm.isDeepAnalysisRequested(objective)) {
    new TeamworkAnalysisSwarm(coordinator.repoRootPath).runAnalysisSwarmSync(objective, files);
  }
  const complexity = TaskComplexityAnalyzer.analyze(objective, files);
  const planId = options.deterministic ? `tw-det-${TeamworkTrackBuilder.hashPlan(objective, files)}` : `tw-${Date.now().toString(36)}`;
  const allTracks = assemblePlanTracks(coordinator, objective, planId, resolveSubtasks(objective, files, complexity, options), options);
  if (shouldStage) {
    stageTracksIntoInboxHelper({
      repoRoot: coordinator.repoRootPath,
      planId,
      objective,
      tracks: allTracks,
      worktreeManager: coordinator.worktreeManager,
      shouldLock: options.acquireLocks ?? shouldStage
    });
    coordinator.mesh.initializeMesh(planId, objective, allTracks);
  }
  const delibSummary = formatDeliberationSummary(delibResult);
  const summary = `Teamwork Plan (${allTracks.length} tracks: ${allTracks.map(t => t.subagentName).join(', ')}).${delibSummary}`;
  return {
    planId, objective, createdAt: new Date().toISOString(), tracks: allTracks, summary, discoveredFiles: files, complexity,
    ...(delibResult ? { deliberation: delibResult, deliberationSummary: delibSummary.trim() } : {})
  };
}
