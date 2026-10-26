import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ITaskDispatcher,
  TaskDispatchResult
} from '@aegis/dialogue-engine';
import { WorktreeManager } from '@aegis/orchestrator';

export interface CliTaskDispatcherOptions {
  repoRoot?: string;
  promptsDir?: string;
  worktreeManager?: WorktreeManager;
}

const normalizePath = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '').trim();

export class CliTaskDispatcher implements ITaskDispatcher {
  private repoRoot: string;
  private promptsDir: string;
  private worktreeManager: WorktreeManager;

  constructor(options: CliTaskDispatcherOptions = {}) {
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.promptsDir = options.promptsDir ?? path.resolve(this.repoRoot, '.aegis', 'prompts');
    this.worktreeManager = options.worktreeManager ?? new WorktreeManager({
      repoRoot: this.repoRoot,
      persistLocks: true
    });
  }

  public async checkLocks(filePaths: string[]): Promise<{ isAvailable: boolean; lockedFiles: string[] }> {
    const lockedMap = this.worktreeManager.getLockedFiles();
    if (lockedMap.size === 0) {
      return { isAvailable: true, lockedFiles: [] };
    }

    const lockedFiles: string[] = [];
    for (const f of filePaths) {
      const norm = normalizePath(f);
      for (const [lockedPath] of lockedMap.entries()) {
        if (normalizePath(lockedPath) === norm) {
          lockedFiles.push(f);
          break;
        }
      }
    }
    return {
      isAvailable: lockedFiles.length === 0,
      lockedFiles
    };
  }

  public async dispatchTask(
    taskContent: string,
    options: { targetWorktree: string; lockLabels: string[] }
  ): Promise<TaskDispatchResult> {
    fs.mkdirSync(this.promptsDir, { recursive: true });
    const taskId = `task-${Date.now().toString(36)}`;
    const targetFile = path.resolve(this.promptsDir, `${taskId}.md`);
    fs.writeFileSync(targetFile, taskContent, 'utf8');

    return {
      success: true,
      taskId,
      targetWorktree: options.targetWorktree,
      lockLabels: options.lockLabels,
      isLockedByOther: false,
      filePathCreated: targetFile,
      message: `Task ${taskId} written to ${targetFile}`
    };
  }
}
