import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface AgentWorktree {
  agentName: string;
  branch: string;
  path: string;
  status: 'idle' | 'running' | 'blocked' | 'review' | 'merged';
  currentIssueId?: number;
  lockedFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorktreeListResult {
  worktrees: AgentWorktree[];
  activeCount: number;
}

function findAncestorRoot(start: string): string | null {
  let cur = start;
  for (let i = 0; i < 5; i++) {
    if (
      fs.existsSync(path.join(cur, '.git')) ||
      (fs.existsSync(path.join(cur, 'packages')) && fs.existsSync(path.join(cur, 'package.json')))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  cur = start;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(cur, '.aegis'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

export function resolveSafeRepoRoot(initial?: string): string {
  if (initial && fs.existsSync(initial)) return path.resolve(initial);
  if (process.env.AEGIS_WORKSPACE && fs.existsSync(process.env.AEGIS_WORKSPACE)) {
    return path.resolve(process.env.AEGIS_WORKSPACE);
  }

  const curCwd = process.cwd();
  const isSuspicious = curCwd.toLowerCase().includes('system32') || curCwd.toLowerCase().endsWith('windows');

  if (!isSuspicious) {
    const isTemp = curCwd.toLowerCase().includes('temp') || curCwd.toLowerCase().includes('tmp');
    if (isTemp) return curCwd;
    return findAncestorRoot(curCwd) || curCwd;
  }

  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  const scratch = path.resolve(homeDir, '.gemini', 'antigravity', 'scratch', 'aegis');
  if (fs.existsSync(scratch)) return scratch;

  return curCwd;
}

export function resolveSafeAegisDir(initial?: string): string {
  return path.join(resolveSafeRepoRoot(initial), '.aegis');
}

export function resolveSafeCacheDir(sub = '', initial?: string): string {
  const base = path.join(resolveSafeAegisDir(initial), 'cache');
  return sub ? path.join(base, sub) : base;
}

export function cleanGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  delete env.GIT_PREFIX;
  delete env.GIT_COMMON_DIR;
  return env;
}
