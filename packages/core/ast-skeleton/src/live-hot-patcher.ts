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

  private static purgeDeletedGitFiles(engine: CodebaseMemoryEngine, ns: MemoryNamespace, worktreeId: string, cwd: string, patched: string[]): void {
    const deletedFiles = GitFastSyncEngine.getDeletedFiles(cwd);
    for (const relPath of deletedFiles) {
      const norm = relPath.replace(/\\/g, '/');
      const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(cwd, relPath);
      if (ns.fileHashes.has(norm) && !fs.existsSync(fullPath)) {
        engine.removeFile(norm, worktreeId);
        patched.push(norm);
      }
    }
  }

  private static patchDirtyGitFiles(engine: CodebaseMemoryEngine, ns: MemoryNamespace, worktreeId: string, cwd: string, patched: string[]): void {
    const dirtyGitFiles = GitFastSyncEngine.getPorcelainStatus(cwd) || [];
    for (const relPath of dirtyGitFiles) {
      const norm = relPath.replace(/\\/g, '/');
      if (patched.includes(norm) || !LiveHotPatcher.SUPPORTED_EXTS.some(ext => norm.endsWith(ext))) continue;
      const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(cwd, relPath);
      if (LiveHotPatcher.isDirty(fullPath, ns.mtimeFingerprints.get(norm)) && LiveHotPatcher.patchDirtyFile(engine, fullPath, worktreeId)) {
        patched.push(norm);
      }
    }
  }

  public static patchUncommitted(
    engine: CodebaseMemoryEngine,
    ns: MemoryNamespace,
    worktreeId = 'default',
    cwd = process.cwd()
  ): HotPatchReport {
    const t0 = performance.now();
    const currentHead = GitFastSyncEngine.getHeadCommit(cwd);
    if (ns.lastCommit && currentHead && ns.lastCommit !== currentHead) {
      engine.clearCache(worktreeId);
    }
    const patched: string[] = [];

    for (const [norm, cachedFp] of ns.mtimeFingerprints.entries()) {
      const fullPath = path.isAbsolute(norm) ? norm : path.resolve(cwd, norm);
      if (LiveHotPatcher.isDirty(fullPath, cachedFp)) {
        if (LiveHotPatcher.patchDirtyFile(engine, fullPath, worktreeId)) {
          patched.push(norm);
        }
      }
    }

    LiveHotPatcher.purgeDeletedGitFiles(engine, ns, worktreeId, cwd, patched);
    LiveHotPatcher.patchDirtyGitFiles(engine, ns, worktreeId, cwd, patched);

    return { patchedFiles: patched, durationMs: performance.now() - t0 };
  }
}
