import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonSafe } from './json-safe.js';
import { debugLogIgnored } from './runtime-helpers.js';

export interface WorktreeRegistryEntry {
  agentName?: string;
  name?: string;
  path: string;
  branch?: string;
}

function extractWorktreeEntries(data: unknown): WorktreeRegistryEntry[] {
  if (Array.isArray(data)) return data as WorktreeRegistryEntry[];
  if (data && typeof data === 'object' && 'worktrees' in data) {
    const entries = (data as { worktrees: unknown }).worktrees;
    if (Array.isArray(entries)) return entries as WorktreeRegistryEntry[];
  }
  return [];
}

function matchWorktreeEntry(list: WorktreeRegistryEntry[], normCwd: string): string | null {
  const isWin = process.platform === 'win32';
  const testCwd = isWin ? normCwd.toLowerCase() : normCwd;
  for (const wt of list) {
    if (!wt.path) continue;
    const wtNorm = wt.path.replace(/\\/g, '/');
    const targetNorm = isWin ? wtNorm.toLowerCase() : wtNorm;
    if (testCwd === targetNorm || testCwd.startsWith(`${targetNorm}/`)) {
      return wt.agentName || wt.name || path.basename(wtNorm);
    }
  }
  return null;
}

function matchRoleByPathSuffix(norm: string): string | null {
  const roles = ['solver', 'qa', 'docs', 'ui'];
  for (const part of norm.split('/')) {
    const matched = roles.find(r => part === r || part.endsWith(`-${r}`));
    if (matched) return matched;
  }
  return null;
}

export class ActiveHeadResolver {
  public static resolveActiveWorktree(cwd = process.cwd(), repoRoot?: string): string {
    const norm = cwd.replace(/\\/g, '/');

    const root = repoRoot || ActiveHeadResolver.findRepoRoot(cwd);
    if (root) {
      const fromJson = ActiveHeadResolver.lookupFromWorktreesJson(norm, root);
      if (fromJson) return fromJson;
    }

    const segmentMatch = norm.match(/(?:experimental|worktrees|\.worktrees)\/([^/]+)/);
    if (segmentMatch) return segmentMatch[1];

    return matchRoleByPathSuffix(norm) ?? 'default';
  }

  private static findRepoRoot(startDir: string): string | null {
    let cur = path.resolve(startDir);
    while (cur) {
      if (fs.existsSync(path.join(cur, '.git')) || fs.existsSync(path.join(cur, '.aegis'))) {
        return cur;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return null;
  }

  private static lookupFromWorktreesJson(normCwd: string, rootDir: string): string | null {
    const jsonPath = path.join(rootDir, '.aegis', 'worktrees.json');
    if (!fs.existsSync(jsonPath)) return null;

    try {
      const data = readJsonSafe<unknown>(jsonPath);
      const list = extractWorktreeEntries(data);
      return matchWorktreeEntry(list, normCwd);
    } catch (err: unknown) {
      debugLogIgnored('active-head-resolver', err);
    }

    return null;
  }
}
