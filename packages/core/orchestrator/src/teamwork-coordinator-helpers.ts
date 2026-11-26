import type { DecomposedSubtask, DecomposeOptions } from './teamwork-decomposer-types.js';
import { TeamworkSharder } from './teamwork-sharder.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { TeamworkHierarchicalTree } from './teamwork-hierarchical-tree.js';
import { SemanticAIDecomposer } from './semantic-ai-decomposer.js';
import type { TeamworkGroundingEngine } from './teamwork-grounding.js';
import type { SubagentProfile } from './teamwork-prompts.js';
import type { ComplexityAnalysisResult } from './task-complexity-analyzer.js';
import type { DeliberationResult } from './teamwork-deliberation-types.js';
import type { PlanTeamworkOptions, TeamworkTrack } from './teamwork-types.js';

export function alignSubtaskPhases(subtasks: DecomposedSubtask[], files: string[]): void {
  for (const t of subtasks) {
    if (t.roleType === 'ui' || t.roleType === 'solver') {
      t.phase = 1;
      t.dependsOn = [];
    } else if (t.roleType === 'qa') {
      t.phase = 2;
      if (!t.dependsOn?.length) t.dependsOn = subtasks.filter(s => s.phase === 1).map(s => s.label);
    } else if (t.roleType === 'docs') {
      t.phase = 3;
      const qa = subtasks.filter(s => s.phase === 2).map(s => s.label);
      t.dependsOn = qa.length > 0 ? qa : subtasks.filter(s => s.phase === 1).map(s => s.label);
    }
  }
  if (files.length > 0) TeamworkSharder.partitionFiles(subtasks, files);
}

export function scaleSemanticSubtasks(
  subtasks: DecomposedSubtask[],
  files: string[],
  objective: string,
  target: number
): DecomposedSubtask[] {
  const solvers = subtasks.filter(t => t.roleType === 'solver');
  TeamworkSharder.shardSolversByFiles(subtasks, files, objective);
  TeamworkSharder.shardQaByFiles(subtasks, files, objective, true);
  const scaled = (solvers.length <= 1 && subtasks.length < target)
    ? TeamworkSharder.shardMaxConcurrency(subtasks, files, target)
    : subtasks;
  alignSubtaskPhases(scaled, files);
  return scaled;
}

export function reconcileSemanticSubtasks(subtasks: DecomposedSubtask[], files: string[], objective: string): void {
  if (!subtasks.some(t => t.roleType === 'solver') && files.some(f => TeamworkSharder.isSourceFile(f))) {
    subtasks.unshift({ roleType: 'solver', label: 'Core', title: `Implement core logic: ${objective}`, targetFiles: [], phase: 1, dependsOn: [] });
  }
  if (!subtasks.some(t => t.roleType === 'qa')) {
    subtasks.push({ roleType: 'qa', label: 'Audit', title: `Audit, triage, and test: ${objective}`, targetFiles: [] });
  }
  TeamworkSharder.shardQaByFiles(subtasks, files, objective, true);
  alignSubtaskPhases(subtasks, files);
}

export function buildCoordinatorTracks(
  subtasks: DecomposedSubtask[],
  profiles: SubagentProfile[],
  isDet: boolean,
  groundingEngine: TeamworkGroundingEngine
): TeamworkTrack[] {
  const tracks: TeamworkTrack[] = [];
  const upstreamFilesMap = new Map<string, string[]>();
  for (const sub of subtasks) {
    const track = TeamworkTrackBuilder.buildSubtaskTrack(sub, profiles, upstreamFilesMap, isDet, groundingEngine);
    tracks.push(track);
    upstreamFilesMap.set(sub.label, sub.targetFiles);
  }
  return tracks;
}

export function resolveSemanticSubtasks(
  objective: string,
  files: string[],
  complexity: ComplexityAnalysisResult,
  options: PlanTeamworkOptions = {}
): DecomposedSubtask[] {
  let subtasks = SemanticAIDecomposer.toDecomposedSubtasks(SemanticAIDecomposer.decompose(objective, files));
  reconcileSemanticSubtasks(subtasks, files, objective);
  const max = options.maxConcurrency ?? 0;
  const isScaling = complexity.tier === 'COMPLEX' || complexity.tier === 'HYPER_SCALE' || Boolean(options.autoScale) || max > 1;
  if (isScaling) {
    subtasks = scaleSemanticSubtasks(subtasks, files, objective, options.maxConcurrency ?? complexity.optimalAgentCount);
  }
  const roles = options.selectedRoles;
  return roles?.length ? subtasks.filter(t => roles.includes(t.roleType)) : subtasks;
}

export function buildDecomposeOptions(
  objective: string,
  complexity: ComplexityAnalysisResult,
  options: PlanTeamworkOptions = {}
): DecomposeOptions {
  const max = options.maxConcurrency ?? 0;
  const isScaling = max > 1 || Boolean(options.autoScale) || Boolean(options.treeSpecialists);
  const useSuggested = complexity.tier === 'TRIVIAL' && !options.explicitRole && !isScaling;
  return {
    maxConcurrency: options.maxConcurrency ?? complexity.optimalAgentCount,
    autoScale: options.autoScale ?? (complexity.tier === 'HYPER_SCALE'),
    selectedRoles: options.selectedRoles ?? (useSuggested ? complexity.suggestedRoles : undefined),
    explicitRole: options.explicitRole,
    treeSpecialists: options.treeSpecialists ?? (complexity.shouldEnableHierarchicalTree && TeamworkHierarchicalTree.isHierarchicalRequested(objective))
  };
}

export function annotateCodexMission(tracks: TeamworkTrack[], objective: string): void {
  for (const track of tracks) {
    if (track.codexInvocationPayload) {
      track.codexInvocationPayload.message = `Mission: ${objective}\n${track.codexInvocationPayload.message}`;
    }
  }
}

export function formatDeliberationSummary(delibResult?: DeliberationResult): string {
  if (!delibResult) return '';
  const status = delibResult.consensus.status.toUpperCase();
  return ` Deliberation [${status}]: ${delibResult.consensus.agreedStrategy} (Score: ${delibResult.consensus.consensusScore}%)`;
}
