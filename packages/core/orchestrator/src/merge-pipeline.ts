import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

export interface MergePipelineOptions {
  repoRoot?: string;
  worktreePrefix?: string;
  baseBranch?: string;
}

export interface MergeStepReport {
  step: 1 | 2 | 3 | 4;
  name: string;
  passed: boolean;
  message: string;
}

export interface MergeResult {
  success: boolean;
  agentName: string;
  steps: MergeStepReport[];
  rollbackExecuted: boolean;
  error?: string;
}

function cleanGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  delete env.GIT_PREFIX;
  delete env.GIT_COMMON_DIR;
  return env;
}

export class MergePipeline {
  private repoRoot: string;
  private worktreePrefix: string;
  private baseBranch: string;

  private detectCurrentBranch(): string {
    try {
      if (fs.existsSync(path.join(this.repoRoot, '.git'))) {
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: this.repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          env: cleanGitEnv()
        }).trim();
        if (branch && branch !== 'HEAD') return branch;
      }
    } catch { /* ignore */ }
    return 'master';
  }

  constructor(options: MergePipelineOptions = {}) {
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.worktreePrefix = options.worktreePrefix ?? 'experimental';
    this.baseBranch = options.baseBranch ?? this.detectCurrentBranch();
  }

  private step1PreMergeCheck(mergingAgent: string, passed: boolean, steps: MergeStepReport[]): boolean {
    if (!passed) {
      steps.push({
        step: 1,
        name: 'Iron Cage & Pre-Merge Verification',
        passed: false,
        message: `Pre-merge quality gate or tests failed for ${mergingAgent}.`
      });
      return false;
    }
    steps.push({
      step: 1,
      name: 'Iron Cage & Pre-Merge Verification',
      passed: true,
      message: `Quality gates passed cleanly for ${mergingAgent}.`
    });
    return true;
  }

  private step2Rebase(mergingAgent: string, agentDir: string, steps: MergeStepReport[]): boolean {
    try {
      execFileSync('git', ['-C', agentDir, 'rebase', this.baseBranch], {
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      steps.push({
        step: 2,
        name: 'Rebase against base branch',
        passed: true,
        message: `Successfully rebased ${mergingAgent} on top of ${this.baseBranch}.`
      });
      return true;
    } catch {
      try {
        execFileSync('git', ['-C', agentDir, 'rebase', '--abort'], {
          stdio: 'pipe',
          env: cleanGitEnv()
        });
      } catch { /* ignore */ }
      steps.push({
        step: 2,
        name: 'Rebase against base branch',
        passed: false,
        message: 'Rebase encountered conflicts. Aborted.'
      });
      return false;
    }
  }

  private step3Merge(mergingAgent: string, steps: MergeStepReport[]): boolean {
    try {
      execFileSync('git', ['checkout', this.baseBranch], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      execFileSync('git', ['merge', '--ff-only', `aegis/${mergingAgent}`], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: true,
        message: `Merged aegis/${mergingAgent} into ${this.baseBranch}.`
      });
      return true;
    } catch {
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: false,
        message: 'Fast-forward merge failed. Non-linear history detected.'
      });
      return false;
    }
  }

  private checkSiblingAhead(siblingDir: string): number {
    try {
      const aheadCountRaw = execFileSync('git', ['-C', siblingDir, 'rev-list', '--count', `${this.baseBranch}..HEAD`], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: cleanGitEnv()
      }).trim();
      return parseInt(aheadCountRaw, 10) || 0;
    } catch {
      return 0;
    }
  }

  private applySiblingSync(sibling: string, siblingDir: string): string {
    const aheadCount = this.checkSiblingAhead(siblingDir);
    if (aheadCount > 0) {
      execFileSync('git', ['-C', siblingDir, 'rebase', this.baseBranch], {
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      return `Rebased ${sibling} workspace (${aheadCount} local commit(s)) onto latest ${this.baseBranch}.`;
    }
    execFileSync('git', ['-C', siblingDir, 'reset', '--hard', this.baseBranch], {
      stdio: 'pipe',
      env: cleanGitEnv()
    });
      return `Synchronized ${sibling} workspace with latest ${this.baseBranch}.`;
  }

  private syncSingleSibling(sibling: string, siblingDir: string, steps: MergeStepReport[]): void {
    try {
      const dirty = execFileSync('git', ['-C', siblingDir, 'status', '--porcelain'], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: cleanGitEnv()
      }).trim();

      if (dirty.length > 0) {
        steps.push({
          step: 4,
          name: `Sibling sync: ${sibling}`,
          passed: true,
          message: `Sibling ${sibling} has uncommitted modifications; skipped hard reset to preserve data.`
        });
        return;
      }

      const message = this.applySiblingSync(sibling, siblingDir);
      steps.push({ step: 4, name: `Sibling sync: ${sibling}`, passed: true, message });
    } catch {
      steps.push({
        step: 4,
        name: `Sibling sync: ${sibling}`,
        passed: false,
        message: `Failed to synchronize sibling ${sibling} with ${this.baseBranch}.`
      });
    }
  }

  private step4SyncSiblings(siblingAgents: string[], mergingAgent: string, steps: MergeStepReport[]): void {
    for (const sibling of siblingAgents) {
      if (sibling === mergingAgent) continue;
      const siblingDir = path.resolve(this.repoRoot, this.worktreePrefix, sibling);
      if (fs.existsSync(siblingDir)) {
        this.syncSingleSibling(sibling, siblingDir, steps);
      }
    }
  }

  public async executePipeline(
    mergingAgent: string,
    siblingAgents: string[],
    preMergeCheckPassed = true
  ): Promise<MergeResult> {
    const steps: MergeStepReport[] = [];
    const agentDir = path.resolve(this.repoRoot, this.worktreePrefix, mergingAgent);

    if (!this.step1PreMergeCheck(mergingAgent, preMergeCheckPassed, steps)) {
      return { success: false, agentName: mergingAgent, steps, rollbackExecuted: false, error: 'Pre-merge verification failed.' };
    }

    if (!this.step2Rebase(mergingAgent, agentDir, steps)) {
      return { success: false, agentName: mergingAgent, steps, rollbackExecuted: true, error: 'Merge conflict detected during rebase.' };
    }

    if (!this.step3Merge(mergingAgent, steps)) {
      return { success: false, agentName: mergingAgent, steps, rollbackExecuted: true, error: 'Merge failed.' };
    }

    this.step4SyncSiblings(siblingAgents, mergingAgent, steps);

    return { success: true, agentName: mergingAgent, steps, rollbackExecuted: false };
  }
}
