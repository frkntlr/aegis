import type { CodebaseMemoryEngine } from './codebase-memory.js';

export interface WriteThroughOptions {
  debounceMs?: number;
  onPersistError?: (err: unknown) => void;
}

export class MemoryWriteThroughHook {
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private dirtyWorktrees = new Set<string>();
  private debounceMs: number;
  private onPersistError?: (err: unknown) => void;

  constructor(
    private readonly engine: CodebaseMemoryEngine,
    options: WriteThroughOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 100;
    this.onPersistError = options.onPersistError;
  }

  public handleFileWrite(filePath: string, content: string, worktreeId = 'default'): boolean {
    const updated = this.engine.indexFile(filePath, content, worktreeId);
    if (updated) {
      this.schedulePersist(worktreeId);
    }
    return updated;
  }

  public handleFileDelete(filePath: string, worktreeId = 'default'): boolean {
    return this.engine.removeFile(filePath, worktreeId);
  }

  private schedulePersist(worktreeId: string): void {
    this.dirtyWorktrees.add(worktreeId);
    const existing = this.debounceTimers.get(worktreeId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(worktreeId);
      this.persistWorktree(worktreeId);
    }, this.debounceMs);

    this.debounceTimers.set(worktreeId, timer);
  }

  private persistWorktree(worktreeId: string): void {
    if (!this.dirtyWorktrees.has(worktreeId)) return;
    this.dirtyWorktrees.delete(worktreeId);
    try {
      this.engine.saveNamespaceToDisk(worktreeId);
    } catch (err: unknown) {
      if (this.onPersistError) {
        this.onPersistError(err);
      }
    }
  }

  public async flush(worktreeId?: string): Promise<void> {
    if (worktreeId) {
      const timer = this.debounceTimers.get(worktreeId);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(worktreeId);
      }
      this.persistWorktree(worktreeId);
    } else {
      for (const [wt, timer] of this.debounceTimers.entries()) {
        clearTimeout(timer);
        this.persistWorktree(wt);
      }
      this.debounceTimers.clear();
      for (const wt of [...this.dirtyWorktrees]) {
        this.persistWorktree(wt);
      }
    }
  }

  public dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.dirtyWorktrees.clear();
  }
}
