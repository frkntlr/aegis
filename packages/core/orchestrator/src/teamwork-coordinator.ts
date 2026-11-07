/**
 * @file teamwork-coordinator.ts
 * Coordinates Antigravity subagent teams, task tracks, locks, and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeManager } from './worktree-manager.js';
import { RoleClassifier, type RoleType } from './role-classifier.js';
import {
  type SubagentProfile,
  getSubagentProfiles
} from './teamwork-prompts.js';
import { TeamworkDecomposer, TeamworkSharder, type DecomposedSubtask } from './teamwork-decomposer.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { TeamworkVisualizer } from './teamwork-visualizer.js';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
import { TeamworkCompactEngine } from './teamwork-compact.js';
import { TeamworkMesh } from './teamwork-mesh.js';
import { computeExecutionWaves, formatParallelDispatchBriefing, formatCompactWaveBriefing } from './teamwork-waves.js';
import { stageTracksIntoInboxHelper, exportSubagentManifestHelper, countPendingInboxHelper } from './teamwork-staging.js';
import { TaskComplexityAnalyzer } from './task-complexity-analyzer.js';
import { TeamworkResearchSwarm } from './teamwork-research-swarm.js';
import { TeamworkAnalysisSwarm } from './teamwork-analysis-swarm.js';
import { TeamworkDeliberationEngine, type DeliberationResult, type DeliberationOptions } from './teamwork-deliberation.js';
import { SemanticAIDecomposer } from './semantic-ai-decomposer.js';
import { TeamworkReflectionEngine, type ReflectionLoopOptions, type FeedbackLoopIterationResult } from './teamwork-reflection.js';
import type { TeamworkTrack, TeamworkPlan, TeamworkStatusReport, ExecutionWave } from './teamwork-types.js';

export * from './teamwork-types.js';
export {
  TeamworkVisualizer, TeamworkGroundingEngine, FastSemanticAnalyzer,
  TeamworkCompactEngine, TeamworkMesh, TaskComplexityAnalyzer,
  TeamworkResearchSwarm, TeamworkAnalysisSwarm, TeamworkDeliberationEngine,
  SemanticAIDecomposer, TeamworkReflectionEngine
};

export class TeamworkCoordinator {
  private repoRoot: string;
  private _worktreeManager?: WorktreeManager;
  private _roleClassifier?: RoleClassifier;
  private _groundingEngine?: TeamworkGroundingEngine;
  private _semanticAnalyzer?: FastSemanticAnalyzer;
  private _compactEngine?: TeamworkCompactEngine;
  private _mesh?: TeamworkMesh;
  private _deliberationEngine?: TeamworkDeliberationEngine;
  private _reflectionEngine?: TeamworkReflectionEngine;
  private cachedProfiles?: SubagentProfile[];

  constructor(repoRoot?: string, wtManager?: WorktreeManager, roleClassifier?: RoleClassifier, grounding?: TeamworkGroundingEngine) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this._worktreeManager = wtManager;
    this._roleClassifier = roleClassifier;
    this._groundingEngine = grounding;
  }

  public get worktreeManager(): WorktreeManager {
    return this._worktreeManager ??= new WorktreeManager({ repoRoot: this.repoRoot, persistLocks: true });
  }

  public get roleClassifier(): RoleClassifier {
    return this._roleClassifier ??= new RoleClassifier();
  }

  public get groundingEngine(): TeamworkGroundingEngine {
    return this._groundingEngine ??= new TeamworkGroundingEngine(this.repoRoot);
  }

  public get semanticAnalyzer(): FastSemanticAnalyzer {
    return this._semanticAnalyzer ??= new FastSemanticAnalyzer(this.repoRoot);
  }

  public get compactEngine(): TeamworkCompactEngine {
    return this._compactEngine ??= new TeamworkCompactEngine(this.repoRoot);
  }

  public get mesh(): TeamworkMesh {
    return this._mesh ??= new TeamworkMesh(this.repoRoot);
  }

  public get deliberationEngine(): TeamworkDeliberationEngine {
    return this._deliberationEngine ??= new TeamworkDeliberationEngine(this.repoRoot);
  }

  public get reflectionEngine(): TeamworkReflectionEngine {
    return this._reflectionEngine ??= new TeamworkReflectionEngine(this.repoRoot, this.mesh);
  }

  public computeWaves(tracks?: TeamworkTrack[]): ExecutionWave[] { return computeExecutionWaves(tracks ?? []); }
  public formatWaveBriefing(waves?: ExecutionWave[]): string { return formatParallelDispatchBriefing(waves ?? []); }
  public formatCompactWaveBriefing(waves?: ExecutionWave[]): string { return formatCompactWaveBriefing(waves ?? []); }

  public getWorktreeManager(): WorktreeManager { return this.worktreeManager; }
  public getRoleClassifier(): RoleClassifier { return this.roleClassifier; }
  public getGroundingEngine(): TeamworkGroundingEngine { return this.groundingEngine; }
  public getSemanticAnalyzer(): FastSemanticAnalyzer { return this.semanticAnalyzer; }
  public getCompactEngine(): TeamworkCompactEngine { return this.compactEngine; }
  public getDeliberationEngine(): TeamworkDeliberationEngine { return this.deliberationEngine; }
  public getReflectionEngine(): TeamworkReflectionEngine { return this.reflectionEngine; }

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

  private resolveSubtasks(
    objective: string,
    files: string[],
    complexity: ReturnType<typeof TaskComplexityAnalyzer.analyze>,
    options?: {
      maxConcurrency?: number;
      autoScale?: boolean;
      selectedRoles?: RoleType[];
      explicitRole?: string;
      treeSpecialists?: boolean;
      deliberate?: boolean;
      semantic?: boolean;
    }
  ): DecomposedSubtask[] {
    const isTreeOrExplicit = Boolean(options?.treeSpecialists || options?.explicitRole);
    const isSemantic = Boolean(options?.semantic || options?.deliberate || (!isTreeOrExplicit && (complexity.tier === 'COMPLEX' || complexity.tier === 'HYPER_SCALE')));
    if (isSemantic) {
      const items = SemanticAIDecomposer.decompose(objective, files);
      let subtasks = SemanticAIDecomposer.toDecomposedSubtasks(items);
      this.reconcileSemanticSubtasks(subtasks, files, objective);
      if (options?.selectedRoles?.length) {
        subtasks = subtasks.filter(t => options.selectedRoles!.includes(t.roleType));
      }
      return subtasks;
    }
    const isScaling = Boolean((options?.maxConcurrency && options.maxConcurrency > 1) || options?.autoScale || options?.treeSpecialists);
    return TeamworkDecomposer.decompose(objective, files, {
      maxConcurrency: options?.maxConcurrency ?? complexity.optimalAgentCount,
      autoScale: options?.autoScale ?? (complexity.tier === 'HYPER_SCALE'),
      selectedRoles: options?.selectedRoles ?? (complexity.tier === 'TRIVIAL' && !options?.explicitRole && !isScaling ? complexity.suggestedRoles : undefined),
      explicitRole: options?.explicitRole,
      treeSpecialists: options?.treeSpecialists ?? complexity.shouldEnableHierarchicalTree
    });
  }

  private reconcileSemanticSubtasks(subtasks: DecomposedSubtask[], files: string[], objective: string): void {
    if (!subtasks.some(t => t.roleType === 'solver') && files.some(f => !RoleClassifier.isUiFile(f) && !f.endsWith('.md') && !f.includes('docs/'))) {
      subtasks.unshift({ roleType: 'solver', label: 'Core', title: `Implement core logic: ${objective}`, targetFiles: [], phase: 1, dependsOn: [] });
    }
    for (const t of subtasks) {
      if (t.roleType === 'ui') {
        t.phase = 1;
        t.dependsOn = [];
      } else if (t.roleType === 'qa') {
        t.phase = 2;
        if (!t.dependsOn?.length) t.dependsOn = subtasks.filter(s => s.phase === 1).map(s => s.label);
      } else if (t.roleType === 'docs') {
        t.phase = 3;
        if (!t.dependsOn?.length) t.dependsOn = subtasks.filter(s => s.phase === 2).map(s => s.label);
      }
    }
    if (files.length > 0) TeamworkSharder.partitionFiles(subtasks, files);
  }

  public planTeamwork(
    objective: string,
    targetFiles: string[] = [],
    options?: {
      deterministic?: boolean; stage?: boolean; acquireLocks?: boolean;
      maxConcurrency?: number; autoScale?: boolean; selectedRoles?: RoleType[];
      explicitRole?: string; treeSpecialists?: boolean; research?: boolean;
      deepAnalyze?: boolean; deliberate?: boolean; semantic?: boolean;
    }
  ): TeamworkPlan {
    const isDet = options?.deterministic === true;
    const shouldStage = options?.stage ?? true;
    const files = targetFiles.length > 0 ? targetFiles : this.semanticAnalyzer.analyze(objective).targetFiles;
    const delibResult = options?.deliberate ? this.deliberate(objective, files) : undefined;
    if (options?.deepAnalyze || TeamworkAnalysisSwarm.isDeepAnalysisRequested(objective)) {
      new TeamworkAnalysisSwarm(this.repoRoot).runAnalysisSwarmSync(objective, files);
    }
    const complexity = TaskComplexityAnalyzer.analyze(objective, files);
    const planId = isDet ? `tw-det-${TeamworkTrackBuilder.hashPlan(objective, files)}` : `tw-${Date.now().toString(36)}`;
    const subtasks = this.resolveSubtasks(objective, files, complexity, options);
    const tracks = this.buildTracks(subtasks, isDet);
    const resTracks = (options?.research || TeamworkResearchSwarm.isResearchRequested(objective))
      ? TeamworkResearchSwarm.buildResearchTracks(objective, planId) : [];
    const allTracks = [...resTracks, ...tracks];

    if (shouldStage) {
      this.stageTracksIntoInbox(planId, objective, allTracks, options?.acquireLocks ?? shouldStage);
      this.mesh.initializeMesh(planId, objective, allTracks);
    }
    const baseSummary = `Teamwork Plan (${allTracks.length} tracks: ${allTracks.map(t => t.subagentName).join(', ')}).`;
    const delibSummary = delibResult
      ? ` Deliberation [${delibResult.consensus.status.toUpperCase()}]: ${delibResult.consensus.agreedStrategy} (Score: ${delibResult.consensus.consensusScore}%)`
      : '';
    const summary = `${baseSummary}${delibSummary}`;
    return {
      planId, objective, createdAt: new Date().toISOString(), tracks: allTracks,
      summary, discoveredFiles: files, complexity,
      ...(delibResult ? { deliberation: delibResult, deliberationSummary: delibSummary.trim() } : {})
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

  public formatLiveMatrix(plan: TeamworkPlan, statuses: Record<string, 'running' | 'done' | 'failed' | 'pending' | 'blocked'> = {}): string {
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
