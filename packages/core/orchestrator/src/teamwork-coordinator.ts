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
    const tracks: TeamworkTrack[] = [];
    const inference = this.roleClassifier.classify({ title: objective, targetFiles });

    const uiFiles = targetFiles.filter(f => RoleClassifier.isUiFile(f));
    const docFiles = targetFiles.filter(f => f.endsWith('.md') || f.includes('docs/') || f.includes('wiki/'));
    const solverFiles = targetFiles.filter(f => !docFiles.includes(f) && !uiFiles.includes(f));

    const solverProfile = profiles.find(p => p.roleType === 'solver')!;
    tracks.push(this.buildTrack('solver', solverProfile, `Implement core logic for: ${objective}`, solverFiles, isDet));

    const qaProfile = profiles.find(p => p.roleType === 'qa')!;
    tracks.push(this.buildTrack('qa', qaProfile, `Audit, triage, and test: ${objective}`, [], isDet));

    this.addAuxiliaryTracks(tracks, profiles, objective, targetFiles, inference.role, uiFiles, docFiles, isDet);
    this.stageTracksIntoInbox(planId, objective, tracks);
    return {
      planId,
      objective,
      createdAt: new Date().toISOString(),
      tracks,
      summary: `Teamwork Plan (${tracks.length} tracks: ${tracks.map(t => t.subagentName).join(', ')}; primary: ${inference.role}).`
    };
  }

  private addAuxiliaryTracks(
    tracks: TeamworkTrack[],
    profiles: SubagentProfile[],
    obj: string,
    files: string[],
    role: string,
    uiFiles: string[],
    docFiles: string[],
    deterministic = false
  ): void {
    const lower = obj.toLowerCase();
    const hasUi = role === 'ui' || uiFiles.length > 0 || lower.includes('ui') || lower.includes('godot ui') ||
      lower.includes('theme') || lower.includes('menu') || lower.includes('hud') || lower.includes('screen') ||
      files.some(f => RoleClassifier.isUiFile(f));
    if (hasUi) {
      const p = profiles.find(x => x.roleType === 'ui')!;
      const assigned = uiFiles.length > 0 ? uiFiles : files.filter(f => RoleClassifier.isUiFile(f));
      tracks.push(this.buildTrack('ui', p, `Refine interface layout and theme for: ${obj}`, assigned, deterministic));
    }
    const hasDocs = role === 'docs' || docFiles.length > 0 || lower.includes('doc') || lower.includes('wiki') || lower.includes('rfc') || files.some(f => f.endsWith('.md'));
    if (hasDocs) {
      const p = profiles.find(x => x.roleType === 'docs')!;
      tracks.push(this.buildTrack('docs', p, `Document specifications and living wiki for: ${obj}`, docFiles, deterministic));
    }
  }

  private buildTrack(
    roleType: RoleType,
    profile: SubagentProfile,
    desc: string,
    files: string[],
    deterministic = false
  ): TeamworkTrack {
    const id = deterministic
      ? `${roleType}-${crypto.createHash('sha256').update(`${desc}:${[...files].sort().join(',')}`).digest('hex').slice(0, 8)}`
      : `${roleType}-${Date.now().toString(36)}`;
    const prompt = compileTrackPrompt(profile, desc, files);
    return {
      id,
      roleType,
      subagentName: profile.name,
      title: profile.title,
      targetFiles: files,
      prompt,
      invocationPayload: {
        TypeName: profile.name,
        Role: profile.title,
        Prompt: prompt,
        Workspace: profile.workspaceMode ?? 'inherit',
        Model: profile.defaultModel ?? 'inherit'
      }
    };
  }

  private stageTracksIntoInbox(planId: string, objective: string, tracks: TeamworkTrack[]): void {
    const inboxPath = path.resolve(this.repoRoot, '.aegis', 'task-inbox.json');
    try { fs.mkdirSync(path.dirname(inboxPath), { recursive: true }); } catch { return; }
    let existing: unknown[] = [];
    if (fs.existsSync(inboxPath)) {
      try { existing = JSON.parse(fs.readFileSync(inboxPath, 'utf8')); } catch { existing = []; }
    }
    const inboxArray = Array.isArray(existing) ? existing : [];

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
        status: 'pending',
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
    statuses: Record<string, 'running' | 'done' | 'failed' | 'pending'> = {}
  ): string {
    const lines: string[] = [
      `### 🤖 Antigravity Teamwork Canlı Görev Matrisi [${plan.planId}]`,
      `**Hedef**: ${plan.objective}`,
      '',
      '| Ajan / Rol | Durum | Kilitli Dosyalar | Model | Görev Özeti |',
      '| :--- | :--- | :--- | :--- | :--- |'
    ];
    for (const t of plan.tracks) {
      const st = statuses[t.subagentName] ?? 'running';
      const icon = st === 'done' ? '✅ Tamamlandı' : st === 'failed' ? '🛑 Hata' : st === 'pending' ? '⏳ Bekliyor' : '🔄 Çalışıyor';
      const locks = t.targetFiles.length > 0 ? t.targetFiles.map(f => `\`${f}\``).join(', ') : '-';
      lines.push(`| \`${t.subagentName}\` | ${icon} | ${locks} | \`${t.invocationPayload.Model}\` | ${t.title} |`);
    }
    return lines.join('\n');
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
        if (Array.isArray(raw)) pendingCount = raw.filter((t: { status?: string }) => t.status !== 'done').length;
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
