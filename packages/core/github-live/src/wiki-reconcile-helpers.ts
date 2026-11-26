import { execFileSync } from 'node:child_process';
import { debugLogIgnored } from '@aegis/shared';
import { redactGitToken } from './wiki-helpers.js';
import type { WikiSyncStateManifest } from './types.js';

export interface DivergenceActionResult {
  pulled: boolean;
  pushed: boolean;
  message: string;
  lastStatus: WikiSyncStateManifest['lastStatus'];
}

export function handleBehindMerge(
  cloneDir: string,
  behind: number,
  env: NodeJS.ProcessEnv
): DivergenceActionResult {
  try {
    execFileSync('git', ['-C', cloneDir, 'merge', 'origin/master', '--ff-only'], { stdio: 'pipe', timeout: 10000, env });
    return { pulled: true, pushed: false, message: `Fast-forward merged ${behind} incoming wiki commit(s).`, lastStatus: 'behind' };
  } catch {
    return { pulled: false, pushed: false, message: 'Failed to fast-forward merge incoming wiki commits.', lastStatus: 'behind' };
  }
}

export function handleAheadPush(
  cloneDir: string,
  ahead: number,
  env: NodeJS.ProcessEnv,
  token?: string
): DivergenceActionResult {
  try {
    execFileSync('git', ['-C', cloneDir, 'push', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
    return { pulled: false, pushed: true, message: `Pushed ${ahead} local wiki commit(s) to remote.`, lastStatus: 'ahead' };
  } catch (err: unknown) {
    const msg = redactGitToken(err instanceof Error ? err.message : String(err), token);
    return { pulled: false, pushed: false, message: `Failed to push local wiki commits: ${msg}`, lastStatus: 'ahead' };
  }
}

export function handleDivergedReconcile(
  cloneDir: string,
  div: { ahead: number; behind: number },
  env: NodeJS.ProcessEnv
): DivergenceActionResult {
  try {
    execFileSync('git', ['-C', cloneDir, 'merge', 'origin/master', '--allow-unrelated-histories', '-X', 'ours'], { stdio: 'pipe', timeout: 10000, env });
    execFileSync('git', ['-C', cloneDir, 'push', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
    return { pulled: true, pushed: true, message: `Reconciled (${div.behind} pulled, ${div.ahead} pushed) diverged wiki commits.`, lastStatus: 'diverged' };
  } catch {
    try {
      execFileSync('git', ['-C', cloneDir, 'merge', '--abort'], { stdio: 'pipe', env });
    } catch (err: unknown) {
      debugLogIgnored('wiki-sync-radar:mergeAbort', err);
    }
    return { pulled: false, pushed: false, message: 'Divergence conflict detected during wiki reconciliation.', lastStatus: 'diverged' };
  }
}

export function resolveDivergenceAction(
  cloneDir: string,
  div: { ahead: number; behind: number },
  env: NodeJS.ProcessEnv,
  token?: string
): DivergenceActionResult {
  if (div.behind > 0 && div.ahead === 0) return handleBehindMerge(cloneDir, div.behind, env);
  if (div.ahead > 0 && div.behind === 0) return handleAheadPush(cloneDir, div.ahead, env, token);
  if (div.ahead > 0 && div.behind > 0) return handleDivergedReconcile(cloneDir, div, env);
  return { pulled: false, pushed: false, message: 'Wiki up to date with remote.', lastStatus: 'clean' };
}
