/**
 * @file teamwork-coordinator.ts
 * Coordinates Antigravity subagent teams, task tracks, locks, and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { WorktreeManager } from './worktree-manager.js';
import { RoleClassifier, type RoleType } from './role-classifier.js';
import {
  type SubagentProfile,
  getSubagentProfiles,
  compileTrackPrompt
} from './teamwork-prompts.js';
import { TeamworkDecomposer } from './teamwork-decomposer.js';
import { TeamworkVisualizer } from './teamwork-visualizer.js';
export { TeamworkVisualizer };

export interface AntigravityInvocationPayload {
  TypeName: string;
  Role: string;
  Prompt: string;
  Workspace: 'share' | 'branch' | 'inherit';
  Model: 'inherit' | 'flash_lite' | 'flash' | 'pro';
}

export interface TeamworkTrack {
  id: string;
  roleType: RoleType;
  subagentName: string;
  title: string;
  targetFiles: string[];
  prompt: string;
  invocationPayload: AntigravityInvocationPayload;
  dependsOn: string[];
  phase: number;
}

export interface TeamworkPlan {
  planId: string;
  objective: string;
  createdAt: string;
  tracks: TeamworkTrack[];
  summary: string;
}

export interface TeamworkStatusReport {
  activeTracksCount: number;
  lockedFilesCount: number;
  pendingInboxCount: number;
  profiles: SubagentProfile[];
  locks: Record<string, string>;
}

function resolveSafeRepoRoot(initial?: string): string {
  if (initial) return initial;
  const cwd = process.cwd();
  if (cwd.toLowerCase().includes('system32')) {
    if (process.env.AEGIS_WORKSPACE && fs.existsSync(process.env.AEGIS_WORKSPACE)) {
      return process.env.AEGIS_WORKSPACE;
    }
    const scratch = path.resolve(process.env.USERPROFILE || 'C:\\Users\\Lenovo', '.gemini', 'antigravity', 'scratch', 'aegis');
    if (fs.existsSync(scratch)) return scratch;
  }
  return cwd;
}

export class TeamworkCoordinator {
  private repoRoot: string;
  private worktreeManager: WorktreeManager;
  private roleClassifier: RoleClassifier;
  private cachedProfiles?: SubagentProfile[];

  constructor(repoRoot?: string, worktreeManager?: WorktreeManager, roleClassifier?: RoleClassifier) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.worktreeManager = worktreeManager ?? new WorktreeManager({ repoRoot: this.repoRoot, persistLocks: true });
    this.roleClassifier = roleClassifier ?? new RoleClassifier();
  }

  public getRoleClassifier(): RoleClassifier {
    return this.roleClassifier;
  }

  public listProfiles(): SubagentProfile[] {
    if (!this.cachedProfiles) {
      this.cachedProfiles = getSubagentProfiles();
    }
    return this.cachedProfiles;
  }

  private hashPlan(objective: string, files: string[]): string {
    const sorted = [...files].sort().join(',');
    return crypto.createHash('sha256').update(`${objective.trim()}::${sorted}`).digest('hex').slice(0, 10);
  }

  public planTeamwork(
    objective: string,
    targetFiles: string[] = [],
    options?: { deterministic?: boolean }
  ): TeamworkPlan {
    const isDet = options?.deterministic === true;
    const planId = isDet
      ? `tw-det-${this.hashPlan(objective, targetFiles)}`
      : `tw-${Date.now().toString(36)}`;
    const profiles = this.listProfiles();
    const subtasks = TeamworkDecomposer.decompose(objective, targetFiles);
    const tracks: TeamworkTrack[] = [];

    for (const sub of subtasks) {
      const profile = profiles.find(p => p.roleType === sub.roleType) ?? profiles[0];
      tracks.push(
        this.buildTrack(
          sub.roleType,
          profile,
          sub.title,
          sub.targetFiles,
          sub.label,
          isDet,
          sub.dependsOn ?? [],
          sub.phase ?? 1
        )
      );
    }

    this.stageTracksIntoInbox(planId, objective, tracks);
    return {
      planId,
      objective,
      createdAt: new Date().toISOString(),
      tracks,
      summary: `Teamwork Plan (${tracks.length} tracks: ${tracks.map(t => t.subagentName).join(', ')}).`
    };
  }

  private buildTrack(
    roleType: RoleType,
    profile: SubagentProfile,
    desc: string,
    files: string[],
    label: string,
    deterministic = false,
    dependsOn: string[] = [],
    phase = 1
  ): TeamworkTrack {
    const subagentName = `${profile.name} [${label}]`;
    const id = deterministic
      ? `${roleType}-${label.toLowerCase()}-${crypto.createHash('sha256').update(`${desc}:${[...files].sort().join(',')}`).digest('hex').slice(0, 6)}`
      : `${roleType}-${label.toLowerCase()}-${Date.now().toString(36)}`;
    const prompt = compileTrackPrompt(profile, desc, files, subagentName, dependsOn, phase);
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

  private stageTracksIntoInbox(planId: string, objective: string, tracks: TeamworkTrack[]): void {
    const inboxPath = path.resolve(this.repoRoot, '.aegis', 'task-inbox.json');
    try { fs.mkdirSync(path.dirname(inboxPath), { recursive: true }); } catch { return; }
    let existing: unknown = null;
    if (fs.existsSync(inboxPath)) {
      try { existing = JSON.parse(fs.readFileSync(inboxPath, 'utf8')); } catch { existing = null; }
    }
    const inboxArray: unknown[] = Array.isArray(existing)
      ? existing
      : (existing && typeof existing === 'object' && Array.isArray((existing as { tasks?: unknown[] }).tasks))
        ? (existing as { tasks: unknown[] }).tasks
        : [];

    const numBase = planId.startsWith('tw-det-')
      ? parseInt(crypto.createHash('md5').update(planId).digest('hex').slice(0, 6), 16) % 100000
      : parseInt(planId.replace(/\D/g, '') || `${Date.now() % 100000}`, 10);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.targetFiles.length > 0) {
        this.worktreeManager.acquireFileLocks(track.subagentName, track.targetFiles);
      }
      inboxArray.push({
        issueNumber: numBase + i,
        title: `[Teamwork Track] ${track.title}`,
        role: track.subagentName,
        worktree: `experimental/${track.roleType}`,
        targetFiles: track.targetFiles,
        acceptanceCriteria: [`Complete track objective: ${objective}`, 'Pass Demir Kafes & verify:task'],
        prompt: track.prompt,
        status: track.dependsOn.length > 0 ? 'blocked' : 'pending',
        dependsOn: track.dependsOn,
        phase: track.phase,
        stagedAt: new Date().toISOString()
      });
    }
    try {
      fs.writeFileSync(inboxPath, JSON.stringify(inboxArray, null, 2), 'utf8');
    } catch { /* ignore if write not permitted */ }
  }

  public exportSubagentManifest(outDir?: string): { count: number; manifestPath: string } {
    const targetDir = outDir ?? path.resolve(this.repoRoot, '.aegis');
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch { /* ignore */ }
    const manifestPath = path.join(targetDir, 'subagents.json');
    const profiles = this.listProfiles();
    const manifest = {
      engine: 'aegis',
      framework: 'antigravity-subagents',
      version: '0.1.0',
      subagents: profiles.map(p => ({
        name: p.name,
        role: p.title,
        description: p.description,
        systemPrompt: p.systemPrompt,
        workspaceMode: p.workspaceMode ?? 'inherit',
        enableWriteTools: p.enableWriteTools,
        enableMcpTools: p.enableMcpTools,
        defaultModel: p.defaultModel ?? 'inherit'
      }))
    };
    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch { /* ignore if write not permitted */ }
    return { count: profiles.length, manifestPath };
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
