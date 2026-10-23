import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
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

export class MergePipeline {
  private repoRoot: string;
  private worktreePrefix: string;
  private baseBranch: string;

  private detectCurrentBranch(): string {
    try {
      if (fs.existsSync(path.join(this.repoRoot, '.git'))) {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (branch && branch !== 'HEAD') return branch;
      } 
    } catch {}
    return 'master';
  }

  constructor(options: MergePipelineOptions = {}) {
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.worktreePrefix = options.worktreePrefix ?? 'experimental';
    this.baseBranch = options.baseBranch ?? this.detectCurrentBranch();
  }

  public async executePipeline(
    mergingAgent: string,
    siblingAgents: string[],
    preMergeCheckPassed = true
  ): Promise<MergeResult> {
    const steps: MergeStepReport[] = [];
    const agentDir = path.resolve(this.repoRoot, this.worktreePrefix, mergingAgent);

    // Step 1: Local Iron Cage & Pre-merge verification
    if (!preMergeCheckPassed) {
      steps.push({
        step: 1,
        name: 'Iron Cage & Pre-Merge Verification',
        passed: false,
        message: 'Pre-merge quality gate or tests failed.'
      });
      return {
        success: false,
        agentName: mergingAgent,
        steps,
        rollbackExecuted: false,
        error: 'Pre-merge verification failed.'
      };
    }
    steps.push({
      step: 1,
      name: 'Iron Cage & Pre-Merge Verification',
      passed: true,
      message: 'Quality gates passed cleanly.'
    });

    // Step 2: Rebase against base branch
    try {
      execSync(`git -C "${agentDir}" rebase "${this.baseBranch}"`, { stdio: 'pipe' });
      steps.push({
        step: 2,
        name: 'Rebase against base branch',
        passed: true,
        message: `Successfully rebased ${mergingAgent} on top of ${this.baseBranch}.`
      });
    } catch {
      // Abort rebase on conflict
      try { execSync(`git -C "${agentDir}" rebase --abort`, { stdio: 'pipe' }); } catch { /* ignore */ }
      steps.push({
        step: 2,
        name: 'Rebase against base branch',
        passed: false,
        message: 'Rebase encountered conflicts. Aborted.'
      });
      return {
        success: false,
        agentName: mergingAgent,
        steps,
        rollbackExecuted: true,
        error: 'Merge conflict detected during rebase.'
      };
    }

    // Step 3: Fast-forward / merge into baseBranch
    try {
      execSync(`git merge --ff-only "aegis/${mergingAgent}"`, { cwd: this.repoRoot, stdio: 'pipe' });
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: true,
        message: `Merged aegis/${mergingAgent} into ${this.baseBranch}.`
      });
    } catch {
      steps.push({
        step: 3,
        name: 'Main branch merge',
        passed: false,
        message: 'Fast-forward merge failed. Non-linear history detected.'
      });
      return {
        success: false,
        agentName: mergingAgent,
        steps,
        rollbackExecuted: true,
        error: 'Merge failed.'
      };
    }

    // Step 4: Sibling Agent Synchronization
    for (const sibling of siblingAgents) {
      if (sibling === mergingAgent) continue;
      const siblingDir = path.resolve(this.repoRoot, this.worktreePrefix, sibling);
      try {
        execSync(`git -C "${siblingDir}" reset --hard "${this.baseBranch}"`, { stdio: 'pipe' });
        steps.push({
          step: 4,
          name: `Sibling sync: ${sibling}`,
          passed: true,
          message: `Synchronized ${sibling} workspace with latest ${this.baseBranch}.`
        });
      } catch {
        steps.push({
          step: 4,
          name: `Sibling sync: ${sibling}`,
          passed: false,
          message: `Failed to reset sibling ${sibling} to ${this.baseBranch}.`
        });
      }
    }

    return {
      success: true,
      agentName: mergingAgent,
      steps,
      rollbackExecuted: false
    };
  }
}
