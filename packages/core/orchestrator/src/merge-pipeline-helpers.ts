import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored } from '@aegis/shared';
import { cleanGitEnv } from './worktree-mutex.js';

export interface MergeOutcome {
  passed: boolean;
  message: string;
}

export function detectCurrentBranch(repoRoot: string): string {
  try {
    if (fs.existsSync(path.join(repoRoot, '.git'))) {
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: cleanGitEnv(),
      }).trim();
      if (branch && branch !== 'HEAD') return branch;
    }
  } catch (err: unknown) {
    debugLogIgnored('MergePipeline:detectCurrentBranch', err);
  }
  return 'master';
}

export function abortGitRebase(agentDir: string): void {
  try {
    execFileSync('git', ['-C', agentDir, 'rebase', '--abort'], {
      stdio: 'pipe',
      env: cleanGitEnv(),
    });
  } catch (err: unknown) {
    debugLogIgnored('MergePipeline:abortRebase', err);
  }
}

export function abortGitMerge(repoRoot: string): void {
  try {
    execFileSync('git', ['merge', '--abort'], {
      cwd: repoRoot,
      stdio: 'pipe',
      env: cleanGitEnv(),
    });
  } catch (err: unknown) {
    debugLogIgnored('MergePipeline:abortMerge', err);
  }
}

export function tryFastForwardMerge(
  repoRoot: string,
  baseBranch: string,
  branchName: string,
): MergeOutcome | null {
  try {
    execFileSync('git', ['merge', '--ff-only', branchName], {
      cwd: repoRoot,
      stdio: 'pipe',
      env: cleanGitEnv(),
    });
    return {
      passed: true,
      message: `Merged ${branchName} into ${baseBranch} via fast-forward.`,
    };
  } catch {
    return null;
  }
}

export function tryNonFfMerge(
  repoRoot: string,
  baseBranch: string,
  branchName: string,
): MergeOutcome {
  try {
    execFileSync(
      'git',
      ['merge', '--no-ff', '-m', `merge: incorporate ${branchName} into ${baseBranch}`, branchName],
      { cwd: repoRoot, stdio: 'pipe', env: cleanGitEnv() },
    );
    return {
      passed: true,
      message: `Merged ${branchName} into ${baseBranch} via merge commit.`,
    };
  } catch {
    abortGitMerge(repoRoot);
    return {
      passed: false,
      message: 'Merge encountered non-linear conflicts. Aborted safely.',
    };
  }
}

export function fuseAgentMemory(
  repoRoot: string,
  mergingAgent: string,
  allSiblings: Set<string>,
): void {
  const memDir = path.resolve(repoRoot, '.aegis', 'memory');
  if (!fs.existsSync(memDir)) return;
  const agentMemDir = path.join(memDir, mergingAgent);
  const defaultMemDir = path.join(memDir, 'default');
  try {
    if (fs.existsSync(agentMemDir)) {
      fs.cpSync(agentMemDir, defaultMemDir, { recursive: true, force: true });
    }
    if (fs.existsSync(defaultMemDir)) {
      for (const sibling of allSiblings) {
        if (sibling === mergingAgent) continue;
        fs.cpSync(defaultMemDir, path.join(memDir, sibling), { recursive: true, force: true });
      }
    }
  } catch (err: unknown) {
    debugLogIgnored('MergePipeline:fuseMemory', err);
  }
}
