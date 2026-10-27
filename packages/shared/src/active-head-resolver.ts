import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WorktreeRegistryEntry {
  agentName?: string;
  name?: string;
  path: string;
  branch?: string;
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

    const parts = norm.split('/');
    for (const part of parts) {
      if (part.endsWith('-solver') || part === 'solver') return 'solver';
      if (part.endsWith('-qa') || part === 'qa') return 'qa';
      if (part.endsWith('-docs') || part === 'docs') return 'docs';
      if (part.endsWith('-ui') || part === 'ui') return 'ui';
    }

    return 'default';
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
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as unknown;
      const list: WorktreeRegistryEntry[] = Array.isArray(data)
        ? data
        : (data && typeof data === 'object' && 'worktrees' in data && Array.isArray((data as { worktrees: unknown[] }).worktrees))
          ? (data as { worktrees: WorktreeRegistryEntry[] }).worktrees
          : [];

      for (const wt of list) {
        if (!wt.path) continue;
        const wtNorm = wt.path.replace(/\\/g, '/');
        if (normCwd === wtNorm || normCwd.startsWith(`${wtNorm}/`)) {
          return wt.agentName || wt.name || path.basename(wtNorm);
        }
      }
    } catch { /* ignore non-fatal read errors */ }

    return null;
  }
}
