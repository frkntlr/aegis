/**
 * @file teamwork-coordinator.ts
 * Coordinates Antigravity subagent teams, task tracks, locks, and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

export class TeamworkCoordinator {
  private repoRoot: string;
  private worktreeManager: WorktreeManager;
  private roleClassifier: RoleClassifier;

  constructor(repoRoot?: string, worktreeManager?: WorktreeManager, roleClassifier?: RoleClassifier) {
    this.repoRoot = repoRoot ?? process.cwd();
    this.worktreeManager = worktreeManager ?? new WorktreeManager({ persistLocks: true });
    this.roleClassifier = roleClassifier ?? new RoleClassifier();
  }

  public listProfiles(): SubagentProfile[] {
    return getSubagentProfiles();
  }

  public planTeamwork(objective: string, targetFiles: string[] = []): TeamworkPlan {
    const planId = `tw-${Date.now().toString(36)}`;
    const profiles = this.listProfiles();
    const tracks: TeamworkTrack[] = [];
    const inference = this.roleClassifier.classify({ title: objective, targetFiles });

    const uiFiles = targetFiles.filter(f => RoleClassifier.isUiFile(f));
    const docFiles = targetFiles.filter(f => f.endsWith('.md') || f.includes('docs/') || f.includes('wiki/'));
    const solverFiles = targetFiles.filter(f => !docFiles.includes(f) && !uiFiles.includes(f));

    const solverProfile = profiles.find(p => p.roleType === 'solver')!;
    tracks.push(this.buildTrack('solver', solverProfile, `Implement core logic for: ${objective}`, solverFiles));

    const qaProfile = profiles.find(p => p.roleType === 'qa')!;
    tracks.push(this.buildTrack('qa', qaProfile, `Audit, triage, and test: ${objective}`, []));

    this.addAuxiliaryTracks(tracks, profiles, objective, targetFiles, inference.role, uiFiles, docFiles);
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
    docFiles: string[]
  ): void {
    const lower = obj.toLowerCase();
    const hasUi = role === 'ui' || uiFiles.length > 0 || lower.includes('ui') || lower.includes('godot ui') ||
      lower.includes('theme') || lower.includes('menu') || lower.includes('hud') || lower.includes('screen') ||
      files.some(f => RoleClassifier.isUiFile(f));
    if (hasUi) {
      const p = profiles.find(x => x.roleType === 'ui')!;
      const assigned = uiFiles.length > 0 ? uiFiles : files.filter(f => RoleClassifier.isUiFile(f));
      tracks.push(this.buildTrack('ui', p, `Refine interface layout and theme for: ${obj}`, assigned));
    }
    const hasDocs = role === 'docs' || docFiles.length > 0 || lower.includes('doc') || lower.includes('wiki') || lower.includes('rfc') || files.some(f => f.endsWith('.md'));
    if (hasDocs) {
      const p = profiles.find(x => x.roleType === 'docs')!;
      tracks.push(this.buildTrack('docs', p, `Document specifications and living wiki for: ${obj}`, docFiles));
    }
  }

  private buildTrack(roleType: RoleType, profile: SubagentProfile, desc: string, files: string[]): TeamworkTrack {
    const id = `${roleType}-${Date.now().toString(36)}`;
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
        Workspace: profile.workspaceMode,
        Model: profile.defaultModel ?? 'inherit'
      }
    };
  }

  private stageTracksIntoInbox(planId: string, objective: string, tracks: TeamworkTrack[]): void {
    const inboxPath = path.resolve(this.repoRoot, '.aegis', 'task-inbox.json');
    fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
    let existing: unknown[] = [];
    if (fs.existsSync(inboxPath)) {
      try { existing = JSON.parse(fs.readFileSync(inboxPath, 'utf8')); } catch { existing = []; }
    }
    const inboxArray = Array.isArray(existing) ? existing : [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.targetFiles.length > 0) {
        this.worktreeManager.acquireFileLocks(track.subagentName, track.targetFiles);
      }
      inboxArray.push({
        issueNumber: parseInt(planId.replace(/\D/g, '') || `${Date.now() % 100000}`, 10) + i,
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
    fs.writeFileSync(inboxPath, JSON.stringify(inboxArray, null, 2), 'utf8');
  }

  public exportSubagentManifest(outDir?: string): { count: number; manifestPath: string } {
    const targetDir = outDir ?? path.resolve(this.repoRoot, '.aegis');
    fs.mkdirSync(targetDir, { recursive: true });
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
        workspaceMode: p.workspaceMode,
        enableWriteTools: p.enableWriteTools,
        enableMcpTools: p.enableMcpTools,
        defaultModel: p.defaultModel ?? 'inherit'
      }))
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
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
