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

    const segmentMatch = norm.match(/(?:experimental|worktrees|\.worktrees)\/([^/]+)/);
    if (segmentMatch) return segmentMatch[1];

    const parts = norm.split('/');
    for (const part of parts) {
      if (part.includes('-solver') || part.endsWith('-solver')) return 'solver';
      if (part.includes('-qa') || part.endsWith('-qa')) return 'qa';
      if (part.includes('-docs') || part.endsWith('-docs')) return 'docs';
      if (part.includes('-ui') || part.endsWith('-ui')) return 'ui';
    }

    const root = repoRoot || ActiveHeadResolver.findRepoRoot(cwd);
    if (root) {
      const fromJson = ActiveHeadResolver.lookupFromWorktreesJson(norm, root);
      if (fromJson) return fromJson;
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
        if (normCwd.startsWith(wtNorm) || wtNorm.startsWith(normCwd)) {
          return wt.agentName || wt.name || path.basename(wtNorm);
        }
      }
    } catch { /* ignore non-fatal read errors */ }

    return null;
  }
}
