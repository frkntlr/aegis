/**
 * @file teamwork-staging.ts
 * Staging helpers for Antigravity subagent task inboxes and manifests.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { TeamworkTrack, TeamworkPlan } from './teamwork-types.js';
import type { SubagentProfile } from './teamwork-prompts.js';
import type { WorktreeManager } from './worktree-manager.js';

function buildTrackInboxItem(
  track: TeamworkTrack,
  numBase: number,
  index: number,
  objective: string
): Record<string, unknown> {
  return {
    id: numBase + index,
    issueNumber: numBase + index,
    title: `[Teamwork Track] ${track.title}`,
    role: track.subagentName,
    worktree: `experimental/${track.roleType}`,
    targetFiles: track.targetFiles,
    acceptanceCriteria: [`Complete track objective: ${objective}`, 'Pass Demir Kafes & verify:task'],
    prompt: track.prompt,
    status: track.dependsOn.length > 0 ? 'blocked' : 'pending',
    dependsOn: track.dependsOn,
    phase: track.phase,
    stagedAt: new Date().toISOString(),
    isGitHubIssue: false,
    trackId: track.id
  };
}

export function stageTracksIntoInboxHelper(
  repoRoot: string,
  planId: string,
  objective: string,
  tracks: TeamworkTrack[],
  worktreeManager: WorktreeManager,
  shouldLock = true
): void {
  const inboxPath = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  try { fs.mkdirSync(path.dirname(inboxPath), { recursive: true }); } catch { return; }
  let existing: unknown = null;
  if (fs.existsSync(inboxPath)) {
    try { existing = JSON.parse(fs.readFileSync(inboxPath, 'utf8')); } catch { existing = null; }
  }
  const inboxArray: unknown[] = Array.isArray(existing) ? existing
    : (existing && typeof existing === 'object' && Array.isArray((existing as { tasks?: unknown[] }).tasks))
      ? (existing as { tasks: unknown[] }).tasks : [];

  const numBase = planId.startsWith('tw-det-')
    ? parseInt(crypto.createHash('md5').update(planId).digest('hex').slice(0, 6), 16) % 100000
    : parseInt(planId.replace(/\D/g, '') || `${Date.now() % 100000}`, 10);

  if (shouldLock) {
    const lockBatch = tracks
      .filter(t => t.targetFiles.length > 0)
      .map(t => ({ agentName: t.subagentName, files: t.targetFiles }));
    if (lockBatch.length > 0) {
      worktreeManager.acquireBatchLocks(lockBatch);
    }
  }

  for (let i = 0; i < tracks.length; i++) {
    inboxArray.push(buildTrackInboxItem(tracks[i], numBase, i, objective));
  }
  try {
    fs.writeFileSync(inboxPath, JSON.stringify(inboxArray, null, 2), 'utf8');
  } catch { /* ignore */ }
}

export function exportSubagentManifestHelper(
  repoRoot: string,
  profiles: SubagentProfile[],
  outDir?: string
): { count: number; manifestPath: string } {
  const targetDir = outDir ?? path.resolve(repoRoot, '.aegis');
  try { fs.mkdirSync(targetDir, { recursive: true }); } catch { /* ignore */ }
  const manifestPath = path.join(targetDir, 'subagents.json');
  const manifest = {
    engine: 'aegis',
    framework: 'antigravity-subagents',
    version: '0.1.0',
    subagents: profiles.map(p => ({
      name: p.name, role: p.title, description: p.description, systemPrompt: p.systemPrompt,
      workspaceMode: p.workspaceMode ?? 'inherit', enableWriteTools: p.enableWriteTools,
      enableMcpTools: p.enableMcpTools, defaultModel: p.defaultModel ?? 'inherit'
    }))
  };
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch { /* ignore if write not permitted */ }
  return { count: profiles.length, manifestPath };
}

export function getInboxStatusesHelper(repoRoot: string): Record<string, 'running' | 'done' | 'failed' | 'pending' | 'blocked'> {
  const inboxPath = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  const statuses: Record<string, 'running' | 'done' | 'failed' | 'pending' | 'blocked'> = {};
  if (!fs.existsSync(inboxPath)) return statuses;
  try {
    const raw = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tasks) ? raw.tasks : []);
    for (const t of list) {
      const st = t.status === 'in_progress' ? 'running' : t.status === 'done' ? 'done' : t.status === 'blocked' ? 'blocked' : 'pending';
      if (t.role) statuses[t.role] = st;
      if (t.trackId) statuses[t.trackId] = st;
    }
  } catch { /* ignore */ }
  return statuses;
}

export function getStagedPlanHelper(repoRoot: string): TeamworkPlan | null {
  const inboxPath = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  if (!fs.existsSync(inboxPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tasks) ? raw.tasks : []);
    if (list.length === 0) return null;
    const tracks: TeamworkTrack[] = list.map((t: { id: number; title: string; role: string; targetFiles: string[]; prompt: string; dependsOn?: string[]; phase?: number; stagedAt?: string; trackId?: string }) => {
      let roleType: 'solver' | 'qa' | 'ui' | 'docs' = 'solver';
      if (t.role.includes('qa')) roleType = 'qa';
      else if (t.role.includes('ui')) roleType = 'ui';
      else if (t.role.includes('doc')) roleType = 'docs';
      return {
        id: t.trackId || String(t.id),
        roleType,
        subagentName: t.role,
        title: (t.title || '').replace(/^\[Teamwork Track\]\s*/, ''),
        targetFiles: Array.isArray(t.targetFiles) ? t.targetFiles : [],
        prompt: t.prompt || '',
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        phase: t.phase || 1,
        invocationPayload: {
          TypeName: roleType === 'solver' ? 'issue-solver' : roleType === 'qa' ? 'qa-hunter' : roleType === 'ui' ? 'ui-specialist' : 'doc-architect',
          Role: t.role,
          Prompt: t.prompt || '',
          Workspace: 'inherit',
          Model: roleType === 'docs' ? 'flash' : 'inherit'
        }
      };
    });
    return {
      planId: `staged-${tracks.length}-tracks`,
      objective: 'Active Teamwork Mission',
      createdAt: list[0]?.stagedAt || new Date().toISOString(),
      tracks,
      summary: `Active Staged Tasks (${tracks.length} tracks).`,
      discoveredFiles: Array.from(new Set(tracks.flatMap(t => t.targetFiles)))
    };
  } catch { return null; }
}
