/**
 * @file teamwork-mesh-persistence.ts
 * Atomic file persistence and process cache for Dynamic Teamwork Mesh.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { debugLogIgnored, resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeMutex } from './worktree-mutex.js';
import type { TeamworkMeshState } from './teamwork-types.js';
import { buildEmptyMeshState, cloneMeshSnapshot, parseMeshPayload } from './teamwork-mesh-helpers.js';

interface ProcessMeshCache {
  state: TeamworkMeshState;
  mtimeMs: number;
  size: number;
}

export class TeamworkMeshPersistence {
  private static processCache = new Map<string, ProcessMeshCache>();
  protected repoRoot: string;
  protected meshFile: string;

  constructor(repoRoot?: string) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.meshFile = path.resolve(this.repoRoot, '.aegis', 'teamwork-mesh.json');
  }

  public getMeshPath(): string {
    return this.meshFile;
  }

  public withLock<T>(fn: () => T): T {
    const unlock = WorktreeMutex.acquire(this.meshFile);
    try {
      return fn();
    } finally {
      unlock();
    }
  }

  public invalidateCache(): void {
    TeamworkMeshPersistence.processCache.delete(this.meshFile);
  }

  public getCachedState(): TeamworkMeshState | undefined {
    const entry = TeamworkMeshPersistence.processCache.get(this.meshFile);
    return entry ? cloneMeshSnapshot(entry.state) : undefined;
  }

  public loadMesh(force = false): TeamworkMeshState {
    try {
      const stat = fs.statSync(this.meshFile);
      const cached = TeamworkMeshPersistence.processCache.get(this.meshFile);
      if (!force && cached && stat.mtimeMs === cached.mtimeMs && stat.size === cached.size) {
        return cloneMeshSnapshot(cached.state);
      }
      const raw = fs.readFileSync(this.meshFile, 'utf8');
      const state = parseMeshPayload(raw);
      TeamworkMeshPersistence.processCache.set(this.meshFile, {
        state: cloneMeshSnapshot(state),
        mtimeMs: stat.mtimeMs,
        size: stat.size
      });
      return cloneMeshSnapshot(state);
    } catch {
      TeamworkMeshPersistence.processCache.delete(this.meshFile);
      return buildEmptyMeshState();
    }
  }

  public loadState(force = false): TeamworkMeshState {
    return this.loadMesh(force);
  }

  public saveMesh(state: TeamworkMeshState): void {
    this.saveState(state);
  }

  public saveState(state: TeamworkMeshState): void {
    const dir = path.dirname(this.meshFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify(state, null, 2);
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const nonce = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const tmp = `${this.meshFile}.tmp-${nonce}`;
      try {
        fs.writeFileSync(tmp, payload, { encoding: 'utf8', flush: true });
        try {
          fs.renameSync(tmp, this.meshFile);
        } catch (renameErr: unknown) {
          debugLogIgnored('TeamworkMeshStore:renameTmp', renameErr);
          fs.copyFileSync(tmp, this.meshFile);
          try { fs.rmSync(tmp, { force: true }); } catch (rmErr: unknown) { debugLogIgnored('TeamworkMeshStore:rmTmp', rmErr); }
        }
        const stat = fs.statSync(this.meshFile);
        TeamworkMeshPersistence.processCache.set(this.meshFile, {
          state: cloneMeshSnapshot(state),
          mtimeMs: stat.mtimeMs,
          size: stat.size
        });
        return;
      } catch (err) {
        try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); } catch (cleanupErr: unknown) { debugLogIgnored('TeamworkMeshStore:cleanupTmp', cleanupErr); }
        if (attempt === maxRetries - 1) throw err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 15);
      }
    }
  }

  public clearMesh(): void {
    this.clearState();
  }

  public clearState(): void {
    TeamworkMeshPersistence.processCache.delete(this.meshFile);
    if (fs.existsSync(this.meshFile)) {
      try { fs.unlinkSync(this.meshFile); } catch (err: unknown) { debugLogIgnored('TeamworkMeshStore:clearState', err); }
    }
  }
}
