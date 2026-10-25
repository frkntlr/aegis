import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitFastSyncEngine } from './git-fast-sync.js';
import type { CodebaseMemoryEngine, MemoryNamespace } from './codebase-memory.js';

export interface HotPatchReport {
  patchedFiles: string[];
  durationMs: number;
}

export class LiveHotPatcher {
  private static readonly SUPPORTED_EXTS = ['.ts', '.tsx', '.gd', '.py', '.rs', '.go', '.cpp'];

  public static isDirty(filePath: string, cachedFingerprint?: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    const currentFp = GitFastSyncEngine.getFileFingerprint(filePath);
    if (!currentFp) return false;
    return cachedFingerprint === undefined || currentFp !== cachedFingerprint;
  }

  public static patchDirtyFile(
    engine: CodebaseMemoryEngine,
    filePath: string,
    worktreeId = 'default'
  ): boolean {
    if (!fs.existsSync(filePath)) return false;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return engine.indexFile(filePath, content, worktreeId);
    } catch {
      return false;
    }
  }

  public static getOrLoadContent(
    engine: CodebaseMemoryEngine,
    ns: MemoryNamespace,
    filePath: string,
    worktreeId = 'default'
  ): string | undefined {
    const full = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (LiveHotPatcher.isDirty(full, ns.mtimeFingerprints.get(filePath))) {
      LiveHotPatcher.patchDirtyFile(engine, full, worktreeId);
    }
    let stored = ns.fileContents.get(filePath);
    if (!stored && fs.existsSync(full)) {
      try {
        stored = fs.readFileSync(full, 'utf8');
        ns.fileContents.set(filePath, stored);
      } catch { /* ignore read failure */ }
    }
    return stored;
  }

  public static patchUncommitted(
    engine: CodebaseMemoryEngine,
    ns: MemoryNamespace,
    worktreeId = 'default',
    cwd = process.cwd()
  ): HotPatchReport {
    const t0 = performance.now();
    const patched: string[] = [];

    // 1. Check tracked files in memory namespace
    for (const [norm, cachedFp] of ns.mtimeFingerprints.entries()) {
      const fullPath = path.isAbsolute(norm) ? norm : path.resolve(cwd, norm);
      if (LiveHotPatcher.isDirty(fullPath, cachedFp)) {
        if (LiveHotPatcher.patchDirtyFile(engine, fullPath, worktreeId)) {
          patched.push(norm);
        }
      }
    }

    // 2. Check uncommitted git files (including untracked new files)
    const dirtyGitFiles = GitFastSyncEngine.getPorcelainStatus(cwd) || [];
    for (const relPath of dirtyGitFiles) {
      const norm = relPath.replace(/\\/g, '/');
      if (patched.includes(norm)) continue;
      if (!LiveHotPatcher.SUPPORTED_EXTS.some(ext => norm.endsWith(ext))) continue;
      const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(cwd, relPath);
      if (LiveHotPatcher.isDirty(fullPath, ns.mtimeFingerprints.get(norm))) {
        if (LiveHotPatcher.patchDirtyFile(engine, fullPath, worktreeId)) {
          patched.push(norm);
        }
      }
    }

    return { patchedFiles: patched, durationMs: performance.now() - t0 };
  }
}
