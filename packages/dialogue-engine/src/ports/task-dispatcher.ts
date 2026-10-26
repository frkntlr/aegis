export interface TaskDispatchResult {
  success: boolean;
  taskId?: string;
  targetWorktree: string;
  lockLabels: string[];
  isLockedByOther: boolean;
  filePathCreated?: string;
  message: string;
}

export interface ITaskDispatcher {
  checkLocks(filePaths: string[]): Promise<{ isAvailable: boolean; lockedFiles: string[] }>;
  dispatchTask(
    taskContent: string,
    options: { targetWorktree: string; lockLabels: string[] }
  ): Promise<TaskDispatchResult>;
}
