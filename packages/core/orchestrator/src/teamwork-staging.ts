/**
 * @file teamwork-staging.ts
 * Staging helpers for Antigravity subagent task inboxes and manifests.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { TeamworkTrack } from './teamwork-types.js';
import type { SubagentProfile } from './teamwork-prompts.js';
import type { WorktreeManager } from './worktree-manager.js';
import { WorktreeMutex } from './worktree-mutex.js';

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
    trackId: track.id,
    stagedAt: new Date().toISOString()
  };
}

function readExistingInboxArray(inboxPath: string): unknown[] {
  if (!fs.existsSync(inboxPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks)) {
      return (raw as { tasks: unknown[] }).tasks;
    }
  } catch { /* ignore */ }
  return [];
}

function writeInboxFile(inboxPath: string, data: unknown[]): void {
  const tmp = `${inboxPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, inboxPath);
  } catch {
    fs.copyFileSync(tmp, inboxPath);
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
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

  const unlock = WorktreeMutex.acquire(inboxPath);
  try {
    const inboxArray = readExistingInboxArray(inboxPath);
    const numBase = planId.startsWith('tw-det-')
      ? parseInt(crypto.createHash('md5').update(planId).digest('hex').slice(0, 6), 16) % 100000
      : parseInt(planId.replace(/\D/g, '') || `${Date.now() % 100000}`, 10);

    if (shouldLock) {
      const lockBatch = tracks
        .filter(t => t.targetFiles.length > 0)
        .map(t => ({ agentName: t.subagentName, files: t.targetFiles }));
      if (lockBatch.length > 0) worktreeManager.acquireBatchLocks(lockBatch);
    }

    for (let i = 0; i < tracks.length; i++) {
      inboxArray.push(buildTrackInboxItem(tracks[i], numBase, i, objective));
    }
    writeInboxFile(inboxPath, inboxArray);
  } catch { /* ignore */ } finally {
    unlock();
  }
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
      enableSubagentTools: p.enableSubagentTools ?? true,
      enableMcpTools: p.enableMcpTools, defaultModel: p.defaultModel ?? 'inherit'
    }))
  };
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch { /* ignore if write not permitted */ }
  return { count: profiles.length, manifestPath };
}

export function countPendingInboxHelper(repoRoot: string): number {
  const inboxPath = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  if (!fs.existsSync(inboxPath)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    const list = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks) ? (raw as { tasks: unknown[] }).tasks : []);
    return list.filter((t: { status?: string }) => t.status !== 'done').length;
  } catch {
    return 0;
  }
}

export function clearStagedInboxHelper(repoRoot: string): number {
  const inboxPath = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  if (!fs.existsSync(inboxPath)) return 0;
  const unlock = WorktreeMutex.acquire(inboxPath);
  try {
    const existing = readExistingInboxArray(inboxPath);
    writeInboxFile(inboxPath, []);
    return existing.length;
  } catch {
    return 0;
  } finally {
    unlock();
  }
}

