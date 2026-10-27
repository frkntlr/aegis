import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitFastSyncEngine } from './git-fast-sync.js';
import { ActiveHeadResolver } from './active-head-resolver.js';
import type { CodebaseMemoryEngine } from './codebase-memory.js';

export interface ColdStartOptions {
  repoRoot?: string;
  blacklist?: string[];
  extensions?: string[];
  worktreeId?: string;
  pruneDeleted?: boolean;
}

export interface ColdStartIndexResult {
  scannedFiles: number;
  indexedFiles: number;
  skippedFiles: number;
  prunedFiles: number;
  durationMs: number;
  fastSynced: boolean;
}

export const DEFAULT_COLD_START_BLACKLIST = [
  'node_modules', '.git', 'dist', 'build', '.aegis',
  '.turbo', 'coverage', '.godot', 'tmp', '.cache',
  'experimental', 'worktrees', '.worktrees'
];

export const DEFAULT_COLD_START_EXTENSIONS = [
  '.ts', '.tsx', '.gd', '.py', '.rs', '.go',
  '.cpp', '.cs', '.xaml', '.sh', '.bash', '.tscn', '.tres'
];

export class ColdStartIndexer {
  private blacklist: Set<string>;
  private extensions: string[];

  constructor(blacklist = DEFAULT_COLD_START_BLACKLIST, extensions = DEFAULT_COLD_START_EXTENSIONS) {
    this.blacklist = new Set(blacklist);
    this.extensions = extensions;
  }

  public collectCandidateFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    this.traverseDirectory(dir, results);
    return results;
  }

  private traverseDirectory(currentDir: string, accumulator: string[]): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!this.blacklist.has(entry.name)) {
          this.traverseDirectory(path.join(currentDir, entry.name), accumulator);
        }
      } else if (entry.isFile()) {
        const norm = entry.name.toLowerCase();
        if (this.extensions.some(ext => norm.endsWith(ext))) {
          accumulator.push(path.join(currentDir, entry.name));
        }
      }
    }
  }

  private indexFileList(engine: CodebaseMemoryEngine, files: string[], worktreeId?: string): { indexed: number; skipped: number } {
    let indexed = 0;
    let skipped = 0;
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (engine.indexFile(file, content, worktreeId)) indexed++;
        else skipped++;
      } catch {
        skipped++;
      }
    }
    return { indexed, skipped };
  }

  public async indexProjectRoot(
    engine: CodebaseMemoryEngine,
    options: ColdStartOptions = {}
  ): Promise<ColdStartIndexResult> {
    const startTime = Date.now();
    const root = path.resolve(options.repoRoot || process.cwd());
    const worktreeId = options.worktreeId;
    const files = this.collectCandidateFiles(root);
    const { indexed, skipped } = this.indexFileList(engine, files, worktreeId);

    let pruned = 0;
    if (options.pruneDeleted !== false) {
      pruned = engine.pruneDeletedFiles(worktreeId, root).prunedFiles.length;
    }
    if (indexed > 0 || pruned > 0) {
      engine.saveNamespaceToDisk(worktreeId);
    }

    return {
      scannedFiles: files.length,
      indexedFiles: indexed,
      skippedFiles: skipped,
      prunedFiles: pruned,
      durationMs: Date.now() - startTime,
      fastSynced: indexed === 0 && files.length > 0
    };
  }

  public indexDirectory(
    engine: CodebaseMemoryEngine,
    dirPath: string,
    worktreeId?: string
  ): { indexed: number; cached: number; fastSynced?: boolean } {
    if (!fs.existsSync(dirPath)) return { indexed: 0, cached: 0 };
    const active = worktreeId || ActiveHeadResolver.resolveActiveWorktree();
    const ns = engine.getNamespace(active);
    const fastSync = GitFastSyncEngine.evaluateFastSync(ns.lastCommit);
    if (fastSync.canSkipScan && ns.fileHashes.size > 0) {
      return { indexed: 0, cached: ns.fileHashes.size, fastSynced: true };
    }

    const files = this.collectCandidateFiles(dirPath);
    let indexed = 0;
    let cached = 0;
    for (const full of files) {
      const norm = full.replace(/\\/g, '/');
      const fp = GitFastSyncEngine.getFileFingerprint(full);
      if (fp && ns.mtimeFingerprints.get(norm) === fp && ns.fileHashes.has(norm)) {
        cached++;
        continue;
      }
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (engine.indexFile(full, content, active)) indexed++;
        else cached++;
      } catch { /* skip read error */ }
    }
    if (indexed > 0 || (fastSync.headCommit && fastSync.headCommit !== ns.lastCommit)) {
      if (fastSync.headCommit) ns.lastCommit = fastSync.headCommit;
      engine.saveNamespaceToDisk(active);
    }
    return { indexed, cached, fastSynced: false };
  }
}
