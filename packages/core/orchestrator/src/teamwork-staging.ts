/**
 * @file teamwork-staging.ts
 * Staging helpers for Antigravity subagent task inboxes and manifests.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { debugLogIgnored, readJsonSafe } from '@aegis/shared';
import type { TeamworkTrack } from './teamwork-types.js';
import type { SubagentProfile } from './teamwork-prompts.js';
import type { WorktreeManager } from './worktree-manager.js';
import { WorktreeMutex } from './worktree-mutex.js';

function buildTrackInboxItem(
  track: TeamworkTrack,
  assignedId: number,
  objective: string
): Record<string, unknown> {
  return {
    id: assignedId,
    issueNumber: assignedId,
    title: `[Teamwork Track] ${track.title}`,
    role: track.subagentName,
    worktree: `experimental/${track.roleType}`,
    targetFiles: track.targetFiles,
    acceptanceCriteria: [`Complete track objective: ${objective}`, 'Pass Demir Kafes & verify:task'],
    prompt: track.prompt,
    codexInvocationPayload: track.codexInvocationPayload,
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
    const raw = readJsonSafe<unknown>(inboxPath);
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks)) {
      return (raw as { tasks: unknown[] }).tasks;
    }
  } catch (err: unknown) { debugLogIgnored('TeamworkStaging:readInbox', err); }
  return [];
}

function writeInboxFile(inboxPath: string, data: unknown[]): void {
  const tmp = `${inboxPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    try {
      fs.renameSync(tmp, inboxPath);
    } catch (renameErr: unknown) {
      debugLogIgnored('TeamworkStaging:renameTmp', renameErr);
      fs.copyFileSync(tmp, inboxPath);
    }
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    } catch (cleanupErr: unknown) {
      debugLogIgnored('TeamworkStaging:cleanupTmp', cleanupErr);
    }
  }
}

function nextInboxNumber(items: unknown[], preferred: number): number {
  return items.reduce<number>((next, item) => {
    if (!item || typeof item !== 'object') return next;
    const record = item as Record<string, unknown>;
    for (const value of [record.id, record.issueNumber]) {
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= next) next = value + 1;
    }
    return next;
  }, Math.max(1, preferred));
}

function collectUsedIds(items: unknown[]): Set<number> {
  const used = new Set<number>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    for (const val of [rec.id, rec.issueNumber]) {
      if (typeof val === 'number' && Number.isSafeInteger(val)) used.add(val);
    }
  }
  return used;
}

function allocateUniqueId(usedIds: Set<number>, candidate: number): number {
  let id = Math.max(1, candidate);
  while (usedIds.has(id)) id++;
  usedIds.add(id);
  return id;
}

function upsertStagedTracks(inboxArray: unknown[], tracks: TeamworkTrack[], objective: string, preferred: number): void {
  const usedIds = collectUsedIds(inboxArray);
  let cursor = nextInboxNumber(inboxArray, preferred);
  for (const track of tracks) {
    const existingIdx = inboxArray.findIndex(
      item => item && typeof item === 'object' && (item as Record<string, unknown>).trackId === track.id
    );
    if (existingIdx >= 0) {
      const prev = inboxArray[existingIdx] as Record<string, unknown>;
      const prevId = typeof prev.issueNumber === 'number' && Number.isSafeInteger(prev.issueNumber)
        ? prev.issueNumber
        : allocateUniqueId(usedIds, cursor);
      inboxArray[existingIdx] = buildTrackInboxItem(track, prevId, objective);
    } else {
      const assignedId = allocateUniqueId(usedIds, cursor);
      cursor = assignedId + 1;
      inboxArray.push(buildTrackInboxItem(track, assignedId, objective));
    }
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
  try { fs.mkdirSync(path.dirname(inboxPath), { recursive: true }); } catch (err: unknown) {
    debugLogIgnored('TeamworkStaging:mkdirInbox', err);
    return;
  }

  const unlock = WorktreeMutex.acquire(inboxPath);
  try {
    const inboxArray = readExistingInboxArray(inboxPath);
    const preferred = planId.startsWith('tw-det-')
      ? parseInt(crypto.createHash('md5').update(planId).digest('hex').slice(0, 6), 16) % 100000
      : parseInt(planId.replace(/\D/g, '') || `${Date.now() % 100000}`, 10);

    if (shouldLock) {
      const lockBatch = tracks
        .filter(t => t.targetFiles.length > 0)
        .map(t => ({ agentName: t.subagentName, files: t.targetFiles }));
      if (lockBatch.length > 0) worktreeManager.acquireBatchLocks(lockBatch);
    }

    upsertStagedTracks(inboxArray, tracks, objective, preferred);
    writeInboxFile(inboxPath, inboxArray);
  } catch (err: unknown) { debugLogIgnored('TeamworkStaging:stageTracks', err); } finally {
    unlock();
  }
}

export function exportSubagentManifestHelper(
  repoRoot: string,
  profiles: SubagentProfile[],
  outDir?: string
): { count: number; manifestPath: string } {
  const targetDir = outDir ?? path.resolve(repoRoot, '.aegis');
  try { fs.mkdirSync(targetDir, { recursive: true }); } catch (err: unknown) { debugLogIgnored('TeamworkStaging:mkdirManifest', err); }
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
  } catch (err: unknown) { debugLogIgnored('TeamworkStaging:writeManifest', err); }
  return { count: profiles.length, manifestPath };
}

export function countPendingInboxHelper(repoRoot: string): number {
  const inboxPath = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
  if (!fs.existsSync(inboxPath)) return 0;
  try {
    const raw = readJsonSafe<unknown>(inboxPath);
    const list = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks) ? (raw as { tasks: unknown[] }).tasks : []);
    return list.filter((t: { status?: string }) => t.status !== 'done').length;
  } catch (err: unknown) {
    debugLogIgnored('TeamworkStaging:countPending', err);
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

