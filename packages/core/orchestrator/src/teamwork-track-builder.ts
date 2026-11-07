/**
 * @file teamwork-track-builder.ts
 * Builds grounded Antigravity subagent tracks, deterministic IDs and prompt payloads.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as crypto from 'node:crypto';
import type { RoleType } from './role-classifier.js';
import {
  type SubagentProfile,
  compileTrackPrompt
} from './teamwork-prompts.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';
import type { TeamworkGroundingEngine } from './teamwork-grounding.js';
import type { TeamworkTrack } from './teamwork-types.js';
import { ROLE_SPECIALISTS } from './teamwork-hierarchical-tree.js';

export class TeamworkTrackBuilder {
  public static hashPlan(objective: string, files: string[]): string {
    const sorted = [...files].sort().join(',');
    return crypto.createHash('sha256').update(`${objective.trim()}::${sorted}`).digest('hex').slice(0, 10);
  }

  public static buildSubtaskTrack(
    sub: DecomposedSubtask,
    profiles: SubagentProfile[],
    upstreamFilesMap: Map<string, string[]>,
    isDet: boolean,
    groundingEngine: TeamworkGroundingEngine
  ): TeamworkTrack {
    const profile = profiles.find(p => p.roleType === sub.roleType) ?? profiles[0];
    const grounding = groundingEngine.buildGroundingSection(sub.targetFiles);
    const upstreamItems = (sub.dependsOn ?? []).map(dep => ({
      subagentName: dep,
      files: upstreamFilesMap.get(dep) ?? []
    }));
    const upstreamContracts = groundingEngine.buildUpstreamContractsSection(upstreamItems);

    return this.buildTrack(
      sub.roleType,
      profile,
      sub.title,
      sub.targetFiles,
      sub.label,
      isDet,
      sub.dependsOn ?? [],
      sub.phase ?? 1,
      grounding,
      upstreamContracts
    );
  }

  public static buildTrack(
    roleType: RoleType,
    profile: SubagentProfile,
    desc: string,
    files: string[],
    label: string,
    deterministic = false,
    dependsOn: string[] = [],
    phase = 1,
    groundingContext?: string,
    upstreamContracts?: string
  ): TeamworkTrack {
    const subagentName = `${profile.name} [${label}]`;
    const id = deterministic
      ? `${roleType}-${label.toLowerCase()}-${crypto.createHash('sha256').update(`${desc}:${[...files].sort().join(',')}`).digest('hex').slice(0, 6)}`
      : `${roleType}-${label.toLowerCase()}-${Date.now().toString(36)}`;
    const prompt = compileTrackPrompt(profile, desc, files, subagentName, dependsOn, phase, groundingContext, upstreamContracts);
    const spec = ROLE_SPECIALISTS[roleType]?.find(s => s.label.toLowerCase() === label.toLowerCase());
    const assignedAegisTools = spec ? spec.assignedTools : (profile.aegisTools ?? []);
    return {
      id,
      roleType,
      subagentName,
      title: `${profile.title} [${label}]`,
      targetFiles: files,
      prompt,
      dependsOn,
      phase,
      assignedAegisTools,
      invocationPayload: {
        TypeName: profile.name,
        Role: `${profile.title} - ${label}`,
        Prompt: prompt,
        Workspace: profile.workspaceMode ?? 'inherit',
        Model: profile.defaultModel ?? 'inherit'
      }
    };
  }
}
