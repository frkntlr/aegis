/**
 * @file teamwork-coordinator.ts
 * Coordinates Antigravity subagent teams, task tracks, locks, and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeManager } from './worktree-manager.js';
import { RoleClassifier, type RoleType } from './role-classifier.js';
import {
  type SubagentProfile,
  getSubagentProfiles,
  compileTrackPrompt
} from './teamwork-prompts.js';
import { TeamworkDecomposer, type DecomposedSubtask } from './teamwork-decomposer.js';
import { TeamworkVisualizer } from './teamwork-visualizer.js';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
import { TeamworkCompactEngine } from './teamwork-compact.js';
import {
  stageTracksIntoInboxHelper,
  exportSubagentManifestHelper,
  getStagedPlanHelper,
  getInboxStatusesHelper
} from './teamwork-staging.js';
import type {
  TeamworkTrack,
  TeamworkPlan,
  TeamworkStatusReport
} from './teamwork-types.js';

export * from './teamwork-types.js';
export { TeamworkVisualizer, TeamworkGroundingEngine, FastSemanticAnalyzer, TeamworkCompactEngine };

export class TeamworkCoordinator {
  private repoRoot: string;
  private _worktreeManager?: WorktreeManager;
  private _roleClassifier?: RoleClassifier;
  private _groundingEngine?: TeamworkGroundingEngine;
  private _semanticAnalyzer?: FastSemanticAnalyzer;
  private _compactEngine?: TeamworkCompactEngine;
  private cachedProfiles?: SubagentProfile[];

  constructor(repoRoot?: string, wtManager?: WorktreeManager, roleClassifier?: RoleClassifier, grounding?: TeamworkGroundingEngine) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this._worktreeManager = wtManager;
    this._roleClassifier = roleClassifier;
    this._groundingEngine = grounding;
  }

  public get worktreeManager(): WorktreeManager {
    if (!this._worktreeManager) {
      this._worktreeManager = new WorktreeManager({ repoRoot: this.repoRoot, persistLocks: true });
    }
    return this._worktreeManager;
  }

  public get roleClassifier(): RoleClassifier {
    if (!this._roleClassifier) {
      this._roleClassifier = new RoleClassifier();
    }
    return this._roleClassifier;
  }

  public get groundingEngine(): TeamworkGroundingEngine {
    if (!this._groundingEngine) {
      this._groundingEngine = new TeamworkGroundingEngine(this.repoRoot);
    }
    return this._groundingEngine;
  }

  public get semanticAnalyzer(): FastSemanticAnalyzer {
    if (!this._semanticAnalyzer) {
      this._semanticAnalyzer = new FastSemanticAnalyzer(this.repoRoot);
    }
    return this._semanticAnalyzer;
  }

  public get compactEngine(): TeamworkCompactEngine {
    if (!this._compactEngine) {
      this._compactEngine = new TeamworkCompactEngine(this.repoRoot);
    }
    return this._compactEngine;
  }

  public getWorktreeManager(): WorktreeManager {
    return this.worktreeManager;
  }

  public getRoleClassifier(): RoleClassifier {
    return this.roleClassifier;
  }

  public getGroundingEngine(): TeamworkGroundingEngine {
    return this.groundingEngine;
  }

  public getSemanticAnalyzer(): FastSemanticAnalyzer {
    return this.semanticAnalyzer;
  }

  public getCompactEngine(): TeamworkCompactEngine {
    return this.compactEngine;
  }

  public listProfiles(): SubagentProfile[] {
    if (!this.cachedProfiles) this.cachedProfiles = getSubagentProfiles();
    return this.cachedProfiles;
  }

  private hashPlan(objective: string, files: string[]): string {
    const sorted = [...files].sort().join(',');
    return crypto.createHash('sha256').update(`${objective.trim()}::${sorted}`).digest('hex').slice(0, 10);
  }

  public planTeamwork(
    objective: string,
    targetFiles: string[] = [],
    options?: { deterministic?: boolean; stage?: boolean; acquireLocks?: boolean }
  ): TeamworkPlan {
    const isDet = options?.deterministic === true;
    const shouldStage = options?.stage ?? true;
    const shouldLock = options?.acquireLocks ?? shouldStage;
    const effectiveFiles = (targetFiles && targetFiles.length > 0)
      ? targetFiles
      : this.semanticAnalyzer.analyze(objective).targetFiles;
    const planId = isDet ? `tw-det-${this.hashPlan(objective, effectiveFiles)}` : `tw-${Date.now().toString(36)}`;
    const profiles = this.listProfiles();
    const subtasks = TeamworkDecomposer.decompose(objective, effectiveFiles);
    const tracks: TeamworkTrack[] = [];
    const upstreamFilesMap = new Map<string, string[]>();

    for (const sub of subtasks) {
      const track = this.buildSubtaskTrack(sub, profiles, upstreamFilesMap, isDet);
      tracks.push(track);
      upstreamFilesMap.set(sub.label, sub.targetFiles);
    }

    if (shouldStage) {
      this.stageTracksIntoInbox(planId, objective, tracks, shouldLock);
    }
    return {
      planId,
      objective,
      createdAt: new Date().toISOString(),
      tracks,
      summary: `Teamwork Plan (${tracks.length} tracks: ${tracks.map(t => t.subagentName).join(', ')}).`,
      discoveredFiles: effectiveFiles
    };
  }

  public compactTeamwork(plan?: TeamworkPlan): string {
    const activePlan = plan ?? this.planTeamwork('Active Mission');
    const status = this.getTeamworkStatus();
    this.compactEngine.compactInbox();
    return this.compactEngine.generateCompactBriefing(activePlan, status);
  }

  private buildSubtaskTrack(
    sub: DecomposedSubtask,
    profiles: SubagentProfile[],
    upstreamFilesMap: Map<string, string[]>,
    isDet: boolean
  ): TeamworkTrack {
    const profile = profiles.find(p => p.roleType === sub.roleType) ?? profiles[0];
    const grounding = this.groundingEngine.buildGroundingSection(sub.targetFiles);
    const upstreamItems = (sub.dependsOn ?? []).map(dep => ({
      subagentName: dep,
      files: upstreamFilesMap.get(dep) ?? []
    }));
    const upstreamContracts = this.groundingEngine.buildUpstreamContractsSection(upstreamItems);

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

  private buildTrack(
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
    return {
      id,
      roleType,
      subagentName,
      title: `${profile.title} [${label}]`,
      targetFiles: files,
      prompt,
      dependsOn,
      phase,
      invocationPayload: {
        TypeName: profile.name,
        Role: `${profile.title} - ${label}`,
        Prompt: prompt,
        Workspace: profile.workspaceMode ?? 'inherit',
        Model: profile.defaultModel ?? 'inherit'
      }
    };
  }

  private stageTracksIntoInbox(planId: string, objective: string, tracks: TeamworkTrack[], shouldLock = true): void {
    stageTracksIntoInboxHelper(this.repoRoot, planId, objective, tracks, this.worktreeManager, shouldLock);
  }

  public exportSubagentManifest(outDir?: string): { count: number; manifestPath: string } {
    return exportSubagentManifestHelper(this.repoRoot, this.listProfiles(), outDir);
  }

  public getStagedPlan(): TeamworkPlan | null {
    return getStagedPlanHelper(this.repoRoot);
  }

  public getInboxStatuses(): Record<string, 'running' | 'done' | 'failed' | 'pending' | 'blocked'> {
    return getInboxStatusesHelper(this.repoRoot);
  }

  public formatLiveMatrix(
    plan: TeamworkPlan,
    statuses: Record<string, 'running' | 'done' | 'failed' | 'pending' | 'blocked'> = {}
  ): string {
    const effectiveStatuses = Object.keys(statuses).length > 0 ? statuses : this.getInboxStatuses();
    return TeamworkVisualizer.formatLiveMatrix(plan, effectiveStatuses);
  }

  public formatAsciiDag(plan: TeamworkPlan): string {
    return TeamworkVisualizer.formatAsciiDag(plan);
  }

  public getTeamworkStatus(): TeamworkStatusReport {
    const locksMap = this.worktreeManager.getLockedFiles();
    const locks: Record<string, string> = {};
    for (const [k, v] of locksMap.entries()) locks[k] = v;

    const inboxPath = path.resolve(this.repoRoot, '.aegis', 'task-inbox.json');
    let pendingCount = 0;
    if (fs.existsSync(inboxPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
        const list = Array.isArray(raw)
          ? raw
          : (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks) ? (raw as { tasks: unknown[] }).tasks : []);
        pendingCount = list.filter((t: { status?: string }) => t.status !== 'done').length;
      } catch { /* ignore */ }
    }

    return {
      activeTracksCount: pendingCount,
      lockedFilesCount: Object.keys(locks).length,
      pendingInboxCount: pendingCount,
      profiles: this.listProfiles(),
      locks
    };
  }
}
