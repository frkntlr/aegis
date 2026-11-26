import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BranchReconciler } from './branch-reconciler.js';
import {
  abortGitRebase,
  detectCurrentBranch,
  fuseAgentMemory,
  tryFastForwardMerge,
  tryNonFfMerge,
} from './merge-pipeline-helpers.js';
import { cleanGitEnv } from './worktree-mutex.js';

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

  constructor(options: MergePipelineOptions = {}) {
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.worktreePrefix = options.worktreePrefix ?? 'experimental';
    this.baseBranch = options.baseBranch ?? detectCurrentBranch(this.repoRoot);
    this.reconciler = new BranchReconciler(this.repoRoot, this.worktreePrefix);
  }

  private step1PreMergeCheck(
    mergingAgent: string,
    passed: boolean,
    steps: MergeStepReport[],
  ): boolean {
    if (!passed) {
      steps.push({
        step: 1,
        name: 'Iron Cage & Pre-Merge Verification',
        passed: false,
        message: `Pre-merge quality gate or tests failed for ${mergingAgent}.`,
      });
      return false;
    }
    steps.push({
      step: 1,
      name: 'Iron Cage & Pre-Merge Verification',
      passed: true,
      message: `Quality gates passed cleanly for ${mergingAgent}.`,
    });
    return true;
  }

  private step2Rebase(
    mergingAgent: string,
    agentDir: string,
    steps: MergeStepReport[],
  ): boolean {
    return this.reconciler.withStashGuard(agentDir, () => {
      try {
        execFileSync('git', ['-C', agentDir, 'rebase', this.baseBranch], {
          stdio: 'pipe',
          env: cleanGitEnv(),
        });
        steps.push({
          step: 2,
          name: 'Rebase against base branch',
          passed: true,
          message: `Successfully rebased ${mergingAgent} on top of ${this.baseBranch}.`,
        });
        return true;
      } catch {
        abortGitRebase(agentDir);
        steps.push({
          step: 2,
          name: 'Rebase against base branch',
          passed: false,
          message: 'Rebase encountered conflicts. Aborted.',
        });
        return false;
      }
    });
  }

  private step3Merge(
    mergingAgent: string,
    agentDir: string,
    steps: MergeStepReport[],
  ): boolean {
    const branchName = this.reconciler.resolveBranchName(mergingAgent, agentDir);
    try {
      execFileSync('git', ['checkout', this.baseBranch], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv(),
      });
      const outcome =
        tryFastForwardMerge(this.repoRoot, this.baseBranch, branchName) ??
        tryNonFfMerge(this.repoRoot, this.baseBranch, branchName);
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: outcome.passed,
        message: outcome.message,
      });
      return outcome.passed;
    } catch {
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: false,
        message: `Merge failed: could not checkout or merge branch ${branchName}.`,
      });
      return false;
    }
  }

  private step4SyncSiblings(
    siblingAgents: string[],
    mergingAgent: string,
    steps: MergeStepReport[],
  ): void {
    const discovered = this.reconciler.discoverWorktrees();
    const allSiblings = new Set<string>(siblingAgents);
    for (const d of discovered) allSiblings.add(d.agentName);

    fuseAgentMemory(this.repoRoot, mergingAgent, allSiblings);

    for (const sibling of allSiblings) {
      if (sibling === mergingAgent) continue;
      const siblingDir = path.resolve(this.repoRoot, this.worktreePrefix, sibling);
      if (fs.existsSync(siblingDir)) {
        const report = this.reconciler.syncWorktree(sibling, siblingDir, this.baseBranch);
        steps.push({
          step: 4,
          name: `Sibling sync: ${sibling}`,
          passed: report.passed,
          message: report.message,
        });
      }
    }
  }

  public async executePipeline(
    mergingAgent: string,
    siblingAgents: string[] = [],
    preMergeCheckPassed = true,
  ): Promise<MergeResult> {
    const steps: MergeStepReport[] = [];
    const agentDir = path.resolve(this.repoRoot, this.worktreePrefix, mergingAgent);
    const fail = (rollbackExecuted: boolean, error: string): MergeResult => ({
      success: false,
      agentName: mergingAgent,
      steps,
      rollbackExecuted,
      error,
    });

    if (!this.step1PreMergeCheck(mergingAgent, preMergeCheckPassed, steps)) {
      return fail(false, 'Pre-merge verification failed.');
    }
    if (!this.step2Rebase(mergingAgent, agentDir, steps)) {
      return fail(true, 'Merge conflict detected during rebase.');
    }
    if (!this.step3Merge(mergingAgent, agentDir, steps)) {
      return fail(true, 'Merge failed.');
    }

    this.step4SyncSiblings(siblingAgents, mergingAgent, steps);
    return { success: true, agentName: mergingAgent, steps, rollbackExecuted: false };
  }
}
