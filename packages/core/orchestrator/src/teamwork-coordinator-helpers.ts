import { RoleClassifier } from './role-classifier.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';
import { TeamworkSharder } from './teamwork-sharder.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import type { TeamworkGroundingEngine } from './teamwork-grounding.js';
import type { SubagentProfile } from './teamwork-prompts.js';
import type { TeamworkTrack } from './teamwork-types.js';

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
  if (!subtasks.some(t => t.roleType === 'solver') && files.some(f => !RoleClassifier.isUiFile(f) && !f.endsWith('.md') && !f.includes('docs/'))) {
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
