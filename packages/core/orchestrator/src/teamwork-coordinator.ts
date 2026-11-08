/**
 * @file teamwork-coordinator.ts
 * Coordinates Antigravity subagent teams, task tracks, locks, and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeManager } from './worktree-manager.js';
import { RoleClassifier, type RoleType } from './role-classifier.js';
import { type SubagentProfile, getSubagentProfiles } from './teamwork-prompts.js';
import { ProjectBootstrapEngine, type BootstrapResult, type BootstrapOptions } from './project-bootstrap.js';
import { TeamworkDecomposer, TeamworkSharder, TeamworkHierarchicalTree, type DecomposedSubtask } from './teamwork-decomposer.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { TeamworkVisualizer } from './teamwork-visualizer.js';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
import { TeamworkCompactEngine } from './teamwork-compact.js';
import { TeamworkMesh } from './teamwork-mesh.js';
import { computeExecutionWaves, formatParallelDispatchBriefing, formatCompactWaveBriefing } from './teamwork-waves.js';
import { stageTracksIntoInboxHelper, exportSubagentManifestHelper, countPendingInboxHelper, clearStagedInboxHelper } from './teamwork-staging.js';
import { TaskComplexityAnalyzer } from './task-complexity-analyzer.js';
import { TeamworkResearchSwarm } from './teamwork-research-swarm.js';
import { TeamworkAnalysisSwarm } from './teamwork-analysis-swarm.js';
import { TeamworkDeliberationEngine, type DeliberationResult, type DeliberationOptions } from './teamwork-deliberation.js';
import { SemanticAIDecomposer } from './semantic-ai-decomposer.js';
import { TeamworkReflectionEngine, type ReflectionLoopOptions, type FeedbackLoopIterationResult } from './teamwork-reflection.js';
import type { TeamworkTrack, TeamworkPlan, TeamworkStatusReport, ExecutionWave } from './teamwork-types.js';

export * from './teamwork-types.js';
export {
  TeamworkVisualizer, TeamworkGroundingEngine, FastSemanticAnalyzer, TeamworkCompactEngine,
  TeamworkMesh, TaskComplexityAnalyzer, TeamworkResearchSwarm, TeamworkAnalysisSwarm,
  TeamworkDeliberationEngine, SemanticAIDecomposer, TeamworkReflectionEngine, ProjectBootstrapEngine
};
export type { BootstrapResult, BootstrapOptions };

export interface TeamworkCoordinatorOptions {
  repoRoot?: string; worktreeManager?: WorktreeManager; roleClassifier?: RoleClassifier;
  groundingEngine?: TeamworkGroundingEngine; semanticAnalyzer?: FastSemanticAnalyzer;
  compactEngine?: TeamworkCompactEngine; mesh?: TeamworkMesh;
  deliberationEngine?: TeamworkDeliberationEngine; reflectionEngine?: TeamworkReflectionEngine;
}

export interface PlanTeamworkOptions {
  deterministic?: boolean; stage?: boolean; acquireLocks?: boolean;
  maxConcurrency?: number; autoScale?: boolean; selectedRoles?: RoleType[];
  explicitRole?: string; treeSpecialists?: boolean; research?: boolean;
  deepAnalyze?: boolean; deliberate?: boolean; semantic?: boolean;
}

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

  constructor(
    repoRootOrOptions?: string | TeamworkCoordinatorOptions,
    wtManager?: WorktreeManager, roleClassifier?: RoleClassifier,
    grounding?: TeamworkGroundingEngine, semanticAnalyzer?: FastSemanticAnalyzer, compactEngine?: TeamworkCompactEngine
  ) {
    if (typeof repoRootOrOptions === 'object' && repoRootOrOptions !== null) {
      this.repoRoot = resolveSafeRepoRoot(repoRootOrOptions.repoRoot);
      this._worktreeManager = repoRootOrOptions.worktreeManager;
      this._roleClassifier = repoRootOrOptions.roleClassifier;
      this._groundingEngine = repoRootOrOptions.groundingEngine;
      this._semanticAnalyzer = repoRootOrOptions.semanticAnalyzer;
      this._compactEngine = repoRootOrOptions.compactEngine;
      this._mesh = repoRootOrOptions.mesh;
      this._deliberationEngine = repoRootOrOptions.deliberationEngine;
      this._reflectionEngine = repoRootOrOptions.reflectionEngine;
    } else {
      this.repoRoot = resolveSafeRepoRoot(repoRootOrOptions);
      this._worktreeManager = wtManager;
      this._roleClassifier = roleClassifier;
      this._groundingEngine = grounding;
      this._semanticAnalyzer = semanticAnalyzer;
      this._compactEngine = compactEngine;
    }
    try { ProjectBootstrapEngine.bootstrap(this.repoRoot); } catch { /* safe */ }
  }

  public bootstrap(options?: BootstrapOptions): BootstrapResult {
    return ProjectBootstrapEngine.bootstrap(this.repoRoot, options);
  }

  public get repoRootPath(): string { return this.repoRoot; }
  public get worktreeManager(): WorktreeManager {
    return this._worktreeManager ??= new WorktreeManager({ repoRoot: this.repoRoot, persistLocks: true });
  }
  public get roleClassifier(): RoleClassifier { return this._roleClassifier ??= new RoleClassifier(); }
  public get groundingEngine(): TeamworkGroundingEngine { return this._groundingEngine ??= new TeamworkGroundingEngine(this.repoRoot); }
  public get semanticAnalyzer(): FastSemanticAnalyzer { return this._semanticAnalyzer ??= new FastSemanticAnalyzer(this.repoRoot); }
  public get compactEngine(): TeamworkCompactEngine { return this._compactEngine ??= new TeamworkCompactEngine(this.repoRoot); }
  public get mesh(): TeamworkMesh { return this._mesh ??= new TeamworkMesh(this.repoRoot); }
  public get deliberationEngine(): TeamworkDeliberationEngine { return this._deliberationEngine ??= new TeamworkDeliberationEngine(this.repoRoot); }
  public get reflectionEngine(): TeamworkReflectionEngine { return this._reflectionEngine ??= new TeamworkReflectionEngine(this.repoRoot, this.mesh); }

  public computeWaves(tracks?: TeamworkTrack[]): ExecutionWave[] { return computeExecutionWaves(tracks ?? []); }
  public formatWaveBriefing(waves?: ExecutionWave[]): string { return formatParallelDispatchBriefing(waves ?? []); }
  public formatCompactWaveBriefing(waves?: ExecutionWave[]): string { return formatCompactWaveBriefing(waves ?? []); }

  public getRepoRoot(): string { return this.repoRoot; }
  public getWorktreeManager(): WorktreeManager { return this.worktreeManager; }
  public getRoleClassifier(): RoleClassifier { return this.roleClassifier; }
  public getGroundingEngine(): TeamworkGroundingEngine { return this.groundingEngine; }
  public getSemanticAnalyzer(): FastSemanticAnalyzer { return this.semanticAnalyzer; }
  public getCompactEngine(): TeamworkCompactEngine { return this.compactEngine; }
  public getDeliberationEngine(): TeamworkDeliberationEngine { return this.deliberationEngine; }
  public getReflectionEngine(): TeamworkReflectionEngine { return this.reflectionEngine; }
  public getMesh(): TeamworkMesh { return this.mesh; }

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

  private scaleSemanticSubtasks(subtasks: DecomposedSubtask[], files: string[], objective: string, target: number): DecomposedSubtask[] {
    const solvers = subtasks.filter(t => t.roleType === 'solver');
    TeamworkSharder.shardSolversByFiles(subtasks, files, objective);
    TeamworkSharder.shardQaByFiles(subtasks, files, objective, true);
    const scaled = (solvers.length <= 1 && subtasks.length < target) ? TeamworkSharder.shardMaxConcurrency(subtasks, files, target) : subtasks;
    this.alignSubtaskPhases(scaled, files);
    return scaled;
  }

  private alignSubtaskPhases(subtasks: DecomposedSubtask[], files: string[]): void {
    for (const t of subtasks) {
      if (t.roleType === 'ui' || t.roleType === 'solver') { t.phase = 1; t.dependsOn = []; }
      else if (t.roleType === 'qa') {
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

  private reconcileSemanticSubtasks(subtasks: DecomposedSubtask[], files: string[], objective: string): void {
    if (!subtasks.some(t => t.roleType === 'solver') && files.some(f => !RoleClassifier.isUiFile(f) && !f.endsWith('.md') && !f.includes('docs/'))) {
      subtasks.unshift({ roleType: 'solver', label: 'Core', title: `Implement core logic: ${objective}`, targetFiles: [], phase: 1, dependsOn: [] });
    }
    if (!subtasks.some(t => t.roleType === 'qa')) {
      subtasks.push({ roleType: 'qa', label: 'Audit', title: `Audit, triage, and test: ${objective}`, targetFiles: [] });
    }
    TeamworkSharder.shardQaByFiles(subtasks, files, objective, true);
    this.alignSubtaskPhases(subtasks, files);
  }

  private resolveSubtasks(
    objective: string,
    files: string[],
    complexity: ReturnType<typeof TaskComplexityAnalyzer.analyze>,
    options?: PlanTeamworkOptions
  ): DecomposedSubtask[] {
    const isSemantic = Boolean(options?.semantic || options?.deliberate);
    if (isSemantic) {
      let subtasks = SemanticAIDecomposer.toDecomposedSubtasks(SemanticAIDecomposer.decompose(objective, files));
      this.reconcileSemanticSubtasks(subtasks, files, objective);
      const isScaling = Boolean(complexity.tier === 'COMPLEX' || complexity.tier === 'HYPER_SCALE' || options?.autoScale || (options?.maxConcurrency && options.maxConcurrency > 1));
      if (isScaling) {
        subtasks = this.scaleSemanticSubtasks(subtasks, files, objective, options?.maxConcurrency ?? complexity.optimalAgentCount);
      }
      return options?.selectedRoles?.length ? subtasks.filter(t => options.selectedRoles!.includes(t.roleType)) : subtasks;
    }
    const isScaling = Boolean((options?.maxConcurrency && options.maxConcurrency > 1) || options?.autoScale || options?.treeSpecialists);
    return TeamworkDecomposer.decompose(objective, files, {
      maxConcurrency: options?.maxConcurrency ?? complexity.optimalAgentCount,
      autoScale: options?.autoScale ?? (complexity.tier === 'HYPER_SCALE'),
      selectedRoles: options?.selectedRoles ?? (complexity.tier === 'TRIVIAL' && !options?.explicitRole && !isScaling ? complexity.suggestedRoles : undefined),
      explicitRole: options?.explicitRole,
      treeSpecialists: options?.treeSpecialists ?? (complexity.shouldEnableHierarchicalTree && TeamworkHierarchicalTree.isHierarchicalRequested(objective))
    });
  }

  public planTeamwork(objective: string, targetFiles: string[] = [], options?: PlanTeamworkOptions): TeamworkPlan {
    try { ProjectBootstrapEngine.bootstrap(this.repoRoot); } catch { /* safe */ }
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
    const delibSummary = delibResult ? ` Deliberation [${delibResult.consensus.status.toUpperCase()}]: ${delibResult.consensus.agreedStrategy} (Score: ${delibResult.consensus.consensusScore}%)` : '';
    const summary = `Teamwork Plan (${allTracks.length} tracks: ${allTracks.map(t => t.subagentName).join(', ')}).${delibSummary}`;
    return {
      planId, objective, createdAt: new Date().toISOString(), tracks: allTracks, summary, discoveredFiles: files, complexity,
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
    this.compactEngine.compactInbox(this.repoRoot);
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

  public formatAsciiDag(plan: TeamworkPlan): string { return TeamworkVisualizer.formatAsciiDag(plan); }

  public advanceWave(planId?: string): { advanced: boolean; currentWave: number; nextPhase: string; nextBatchPayload: unknown[]; status?: import('./teamwork-mesh.js').WaveStatus; readinessReport?: string } {
    const meshRes = this.mesh.advanceWave(planId);
    const nextPhase = meshRes.nextWave === 2 ? 'QA Hunter Verification' : (meshRes.nextWave === 3 ? 'Living Architecture Synthesis' : 'Final Delivery');
    const nextBatchPayload = this.mesh.listPeers().filter(p => p.currentActivity.includes(`Wave ${meshRes.nextWave}`));
    return { advanced: meshRes.advanced, currentWave: meshRes.nextWave, nextPhase, nextBatchPayload, status: meshRes.status, readinessReport: meshRes.readinessReport };
  }

  public clearLocks(): number { return this.worktreeManager.clearAllLocks(); }

  public clearTeamwork(): { locksCleared: number; tasksCleared: number } {
    const locksCleared = this.clearLocks();
    const tasksCleared = clearStagedInboxHelper(this.repoRoot);
    try { this.mesh.clearMesh(); } catch { /* safe */ }
    return { locksCleared, tasksCleared };
  }

  public getTeamworkStatus(): TeamworkStatusReport {
    const locks: Record<string, string> = Object.fromEntries(this.worktreeManager.getLockedFiles().entries());
    const pendingCount = countPendingInboxHelper(this.repoRoot);
    return {
      activeTracksCount: pendingCount, lockedFilesCount: Object.keys(locks).length,
      pendingInboxCount: pendingCount, profiles: this.listProfiles(), locks
    };
  }
}

export function clearTeamwork(repoRoot?: string): { locksCleared: number; tasksCleared: number } {
  return new TeamworkCoordinator(repoRoot).clearTeamwork();
}

export function clearLocks(repoRoot?: string): number {
  return new TeamworkCoordinator(repoRoot).clearLocks();
}

