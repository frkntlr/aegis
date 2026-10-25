import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CodebaseMemoryEngine } from './codebase-memory.js';

export interface WatcherOptions {
  worktreeId?: string;
  debounceMs?: number;
  exts?: string[];
}

export class CodebaseMemoryWatcher {
  private engine: CodebaseMemoryEngine;
  private worktreeId: string;
  private debounceMs: number;
  private exts: string[];
  private fsWatcher: fs.FSWatcher | null = null;
  private watchedDir: string | null = null;
  private pendingFiles = new Set<string>();
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(engine: CodebaseMemoryEngine, options: WatcherOptions = {}) {
    this.engine = engine;
    this.worktreeId = options.worktreeId || 'default';
    this.debounceMs = options.debounceMs ?? 150;
    this.exts = options.exts || ['.ts', '.tsx', '.gd', '.py', '.rs', '.go', '.tscn', '.tres'];
  }

  public isWatching(): boolean {
    return this.fsWatcher !== null;
  }

  public getWatchedDir(): string | null {
    return this.watchedDir;
  }

  public start(targetDir: string): boolean {
    const full = path.resolve(process.cwd(), targetDir);
    if (!fs.existsSync(full)) return false;
    this.stop();

    try {
      this.watchedDir = full;
      this.fsWatcher = fs.watch(full, { recursive: true }, (_event, filename) => {
        if (filename) this.handleRawEvent(full, filename);
      });
      return true;
    } catch {
      return false;
    }
  }

  public stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    this.watchedDir = null;
    this.pendingFiles.clear();
  }

  public handleRawEvent(baseDir: string, filename: string): void {
    const full = path.join(baseDir, filename);
    const norm = full.replace(/\\/g, '/');
    if (this.shouldIgnore(norm)) return;

    this.pendingFiles.add(full);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.flushPendingFiles();
    }, this.debounceMs);
  }

  private shouldIgnore(normPath: string): boolean {
    const ignoredDirs = ['/node_modules/', '/.git/', '/dist/', '/.aegis/', '/build/'];
    if (ignoredDirs.some(d => normPath.includes(d))) return true;
    const ext = path.extname(normPath).toLowerCase();
    return !this.exts.includes(ext);
  }

  public flushPendingFiles(): { processed: number; updated: number } {
    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();
    let updated = 0;

    for (const f of files) {
      if (!fs.existsSync(f)) {
        if (this.engine.removeFile(f, this.worktreeId)) updated++;
        continue;
      }
      try {
        const content = fs.readFileSync(f, 'utf8');
        if (this.engine.indexFile(f, content, this.worktreeId)) {
          updated++;
        }
      } catch { /* skip read errors */ }
    }

    if (updated > 0) {
      this.engine.saveNamespaceToDisk(this.worktreeId);
    }
    return { processed: files.length, updated };
  }
}
