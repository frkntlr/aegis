import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CodebaseMemoryEngine } from './codebase-memory.js';

export interface WatcherOptions {
  worktreeId?: string;
  debounceMs?: number;
  settlingMs?: number;
  backoffDelays?: number[];
  exts?: string[];
  fileReader?: (filePath: string) => string;
}

export class CodebaseMemoryWatcher {
  private engine: CodebaseMemoryEngine;
  private worktreeId: string;
  private debounceMs: number;
  private settlingMs: number;
  private backoffDelays: number[];
  private exts: string[];
  private fileReader: ((filePath: string) => string) | null = null;
  private fsWatcher: fs.FSWatcher | null = null;
  private watchedDir: string | null = null;
  private pendingFiles = new Set<string>();
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(engine: CodebaseMemoryEngine, options: WatcherOptions = {}) {
    this.engine = engine;
    this.worktreeId = options.worktreeId || 'default';
    this.debounceMs = options.debounceMs ?? 150;
    this.settlingMs = options.settlingMs ?? 20;
    this.backoffDelays = options.backoffDelays ?? [50, 150, 300];
    this.exts = options.exts || ['.ts', '.tsx', '.gd', '.py', '.rs', '.go', '.tscn', '.tres'];
    this.fileReader = options.fileReader || null;
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

  public readFileWithSettling(filePath: string): string | null {
    for (let attempt = 0; attempt <= this.backoffDelays.length; attempt++) {
      try {
        if (!fs.existsSync(filePath)) return null;
        const size1 = fs.statSync(filePath).size;
        if (this.settlingMs > 0) {
          const waitBuf = new Int32Array(new SharedArrayBuffer(4));
          Atomics.wait(waitBuf, 0, 0, this.settlingMs);
          if (!fs.existsSync(filePath)) return null;
          if (fs.statSync(filePath).size !== size1) {
            throw Object.assign(new Error('File mutating'), { code: 'EBUSY' });
          }
        }
        return this.fileReader ? this.fileReader(filePath) : fs.readFileSync(filePath, 'utf8');
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (attempt < this.backoffDelays.length && (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')) {
          const delay = this.backoffDelays[attempt];
          const waitBuf = new Int32Array(new SharedArrayBuffer(4));
          Atomics.wait(waitBuf, 0, 0, delay);
          continue;
        }
        return null;
      }
    }
    return null;
  }

  private processSingleFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return this.engine.removeFile(filePath, this.worktreeId);
    }
    const content = this.readFileWithSettling(filePath);
    if (content === null) return false;
    return this.engine.indexFile(filePath, content, this.worktreeId);
  }

  public flushPendingFiles(): { processed: number; updated: number } {
    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();
    let updated = 0;

    for (const f of files) {
      if (this.processSingleFile(f)) {
        updated++;
      }
    }

    if (updated > 0) {
      this.engine.saveNamespaceToDisk(this.worktreeId);
    }
    return { processed: files.length, updated };
  }
}
