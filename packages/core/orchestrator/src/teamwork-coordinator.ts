/**
 * @file teamwork-coordinator.ts
 * Coordinates Antigravity subagent teams, task tracks, locks, and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeManager } from './worktree-manager.js';
import { RoleClassifier } from './role-classifier.js';
import {
  type SubagentProfile,
  getSubagentProfiles
} from './teamwork-prompts.js';
import { TeamworkDecomposer } from './teamwork-decomposer.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { TeamworkVisualizer } from './teamwork-visualizer.js';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
import { TeamworkCompactEngine } from './teamwork-compact.js';
import { TeamworkMesh } from './teamwork-mesh.js';
import { computeExecutionWaves, formatParallelDispatchBriefing, formatCompactWaveBriefing } from './teamwork-waves.js';
import { stageTracksIntoInboxHelper, exportSubagentManifestHelper, countPendingInboxHelper } from './teamwork-staging.js';
import type {
  TeamworkTrack,
  TeamworkPlan,
  TeamworkStatusReport,
  ExecutionWave
} from './teamwork-types.js';

export * from './teamwork-types.js';
export { TeamworkVisualizer, TeamworkGroundingEngine, FastSemanticAnalyzer, TeamworkCompactEngine, TeamworkMesh };

export class TeamworkCoordinator {
  private repoRoot: string;
  private _worktreeManager?: WorktreeManager;
  private _roleClassifier?: RoleClassifier;
  private _groundingEngine?: TeamworkGroundingEngine;
  private _semanticAnalyzer?: FastSemanticAnalyzer;
  private _compactEngine?: TeamworkCompactEngine;
  private _mesh?: TeamworkMesh;
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

  public get mesh(): TeamworkMesh {
    if (!this._mesh) {
      this._mesh = new TeamworkMesh(this.repoRoot);
    }
    return this._mesh;
  }

  public computeWaves(tracks?: TeamworkTrack[]): ExecutionWave[] {
    return computeExecutionWaves(tracks ?? []);
  }

  public formatWaveBriefing(waves?: ExecutionWave[]): string {
    return formatParallelDispatchBriefing(waves ?? []);
  }

  public formatCompactWaveBriefing(waves?: ExecutionWave[]): string {
    return formatCompactWaveBriefing(waves ?? []);
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

  public planTeamwork(
    objective: string,
    targetFiles: string[] = [],
    options?: {
      deterministic?: boolean;
      stage?: boolean;
      acquireLocks?: boolean;
      maxConcurrency?: number;
      autoScale?: boolean;
    }
  ): TeamworkPlan {
    const isDet = options?.deterministic === true;
    const shouldStage = options?.stage ?? true;
    const shouldLock = options?.acquireLocks ?? shouldStage;
    const files = targetFiles.length > 0 ? targetFiles : this.semanticAnalyzer.analyze(objective).targetFiles;
    const planId = isDet ? `tw-det-${TeamworkTrackBuilder.hashPlan(objective, files)}` : `tw-${Date.now().toString(36)}`;
    const subtasks = TeamworkDecomposer.decompose(objective, files, {
      maxConcurrency: options?.maxConcurrency,
      autoScale: options?.autoScale
    });
    const tracks = this.buildTracks(subtasks, isDet);

    if (shouldStage) {
      this.stageTracksIntoInbox(planId, objective, tracks, shouldLock);
      this.mesh.initializeMesh(planId, objective, tracks);
    }
    return {
      planId, objective, createdAt: new Date().toISOString(), tracks,
      summary: `Teamwork Plan (${tracks.length} tracks: ${tracks.map(t => t.subagentName).join(', ')}).`,
      discoveredFiles: files
    };
  }

  private buildTracks(subtasks: ReturnType<typeof TeamworkDecomposer.decompose>, isDet: boolean): TeamworkTrack[] {
    const profiles = this.listProfiles();
    const tracks: TeamworkTrack[] = [];
    const upstreamFilesMap = new Map<string, string[]>();
    for (const sub of subtasks) {
      const track = TeamworkTrackBuilder.buildSubtaskTrack(sub, profiles, upstreamFilesMap, isDet, this.groundingEngine);
      tracks.push(track);
      upstreamFilesMap.set(sub.label, sub.targetFiles);
    }
    return tracks;
  }

  public compactTeamwork(plan?: TeamworkPlan): string {
    const activePlan = plan ?? this.planTeamwork('Active Mission');
    const status = this.getTeamworkStatus();
    this.compactEngine.compactInbox();
    return this.compactEngine.generateCompactBriefing(activePlan, status);
  }

  private stageTracksIntoInbox(planId: string, objective: string, tracks: TeamworkTrack[], shouldLock = true): void {
    stageTracksIntoInboxHelper(this.repoRoot, planId, objective, tracks, this.worktreeManager, shouldLock);
  }

  public exportSubagentManifest(outDir?: string): { count: number; manifestPath: string } {
    return exportSubagentManifestHelper(this.repoRoot, this.listProfiles(), outDir);
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

  public advanceWave(planId?: string): { advanced: boolean; currentWave: number; nextPhase: string; nextBatchPayload: unknown[] } {
    const meshRes = this.mesh.advanceWave(planId);
    const nextPhase = meshRes.nextWave === 2
      ? 'QA Hunter Verification'
      : (meshRes.nextWave === 3 ? 'Living Architecture Synthesis' : 'Final Delivery');
    const nextBatchPayload = this.mesh.listPeers().filter(p => p.currentActivity.includes(`Wave ${meshRes.nextWave}`));
    return {
      advanced: meshRes.advanced,
      currentWave: meshRes.nextWave,
      nextPhase,
      nextBatchPayload
    };
  }

  public getTeamworkStatus(): TeamworkStatusReport {
    const locksMap = this.worktreeManager.getLockedFiles();
    const locks: Record<string, string> = {};
    for (const [k, v] of locksMap.entries()) locks[k] = v;
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
