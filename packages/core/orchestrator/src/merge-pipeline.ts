import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { cleanGitEnv } from './worktree-mutex.js';
import { BranchReconciler } from './branch-reconciler.js';

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

export class MergePipeline {
  private repoRoot: string;
  private worktreePrefix: string;
  private baseBranch: string;
  private reconciler: BranchReconciler;

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
    this.reconciler = new BranchReconciler(this.repoRoot, this.worktreePrefix);
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
    return this.reconciler.withStashGuard(agentDir, () => {
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
        this.abortRebase(agentDir);
        steps.push({
          step: 2,
          name: 'Rebase against base branch',
          passed: false,
          message: 'Rebase encountered conflicts. Aborted.'
        });
        return false;
      }
    });
  }

  private abortRebase(agentDir: string): void {
    try {
      execFileSync('git', ['-C', agentDir, 'rebase', '--abort'], {
        stdio: 'pipe',
        env: cleanGitEnv()
      });
    } catch { /* ignore */ }
  }

  private step3Merge(mergingAgent: string, agentDir: string, steps: MergeStepReport[]): boolean {
    const branchName = this.reconciler.resolveBranchName(mergingAgent, agentDir);
    try {
      execFileSync('git', ['checkout', this.baseBranch], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      return this.executeMergeStrategies(branchName, steps);
    } catch {
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: false,
        message: `Merge failed: could not checkout or merge branch ${branchName}.`
      });
      return false;
    }
  }

  private tryFastForward(branchName: string, steps: MergeStepReport[]): boolean {
    try {
      execFileSync('git', ['merge', '--ff-only', branchName], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: true,
        message: `Merged ${branchName} into ${this.baseBranch} via fast-forward.`
      });
      return true;
    } catch {
      return false;
    }
  }

  private tryMergeCommit(branchName: string, steps: MergeStepReport[]): boolean {
    try {
      execFileSync('git', ['merge', '--no-ff', '-m', `merge: incorporate ${branchName} into ${this.baseBranch}`, branchName], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: true,
        message: `Merged ${branchName} into ${this.baseBranch} via merge commit.`
      });
      return true;
    } catch {
      this.abortMerge();
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: false,
        message: 'Merge encountered non-linear conflicts. Aborted safely.'
      });
      return false;
    }
  }

  private executeMergeStrategies(branchName: string, steps: MergeStepReport[]): boolean {
    if (this.tryFastForward(branchName, steps)) return true;
    return this.tryMergeCommit(branchName, steps);
  }

  private abortMerge(): void {
    try {
      execFileSync('git', ['merge', '--abort'], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
    } catch { /* ignore */ }
  }

  private step4SyncSiblings(siblingAgents: string[], mergingAgent: string, steps: MergeStepReport[]): void {
    const discovered = this.reconciler.discoverWorktrees();
    const allSiblings = new Set<string>(siblingAgents);
    for (const d of discovered) allSiblings.add(d.agentName);

    this.fuseMemoryToMasterAndSiblings(mergingAgent, allSiblings);

    for (const sibling of allSiblings) {
      if (sibling === mergingAgent) continue;
      const siblingDir = path.resolve(this.repoRoot, this.worktreePrefix, sibling);
      if (fs.existsSync(siblingDir)) {
        const report = this.reconciler.syncWorktree(sibling, siblingDir, this.baseBranch);
        steps.push({
          step: 4,
          name: `Sibling sync: ${sibling}`,
          passed: report.passed,
          message: report.message
        });
      }
    }
  }

  private fuseMemoryToMasterAndSiblings(mergingAgent: string, allSiblings: Set<string>): void {
    const memDir = path.resolve(this.repoRoot, '.aegis', 'memory');
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
    } catch { /* ignore memory sync error */ }
  }

  public async executePipeline(
    mergingAgent: string,
    siblingAgents: string[] = [],
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

    if (!this.step3Merge(mergingAgent, agentDir, steps)) {
      return { success: false, agentName: mergingAgent, steps, rollbackExecuted: true, error: 'Merge failed.' };
    }

    this.step4SyncSiblings(siblingAgents, mergingAgent, steps);

    return { success: true, agentName: mergingAgent, steps, rollbackExecuted: false };
  }
}
