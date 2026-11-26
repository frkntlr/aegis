import * as crypto from 'node:crypto';
import { MemoryAdapterResolver } from './memory-adapter-resolver.js';
import { GitFastSyncEngine } from './git-fast-sync.js';
import { ActiveHeadResolver } from './active-head-resolver.js';
import { ColdStartIndexer, type ColdStartIndexResult } from './cold-start-indexer.js';
import { MemoryWriteThroughHook } from './memory-write-through-hook.js';
import { CodebaseMemoryBase } from './codebase-memory-namespace.js';
import { executeMemoryQuery } from './codebase-memory-query.js';
import type {
  CodebaseMemoryAdapters,
  CodebaseMemoryHost,
  MemoryQueryOptions,
  MemoryQueryResult
} from './codebase-memory-types.js';

export type {
  CodebaseMemoryAdapters,
  CodebaseMemoryHost,
  MemoryNamespace,
  MemoryQueryOptions,
  MemoryQueryResult,
  MemoryStats
} from './codebase-memory-types.js';

export class CodebaseMemoryEngine extends CodebaseMemoryBase implements CodebaseMemoryHost {
  private writeThroughHook: MemoryWriteThroughHook;
  private coldStartIndexer = new ColdStartIndexer();

  constructor(adapters: CodebaseMemoryAdapters = {}) {
    super(adapters);
    this.writeThroughHook = new MemoryWriteThroughHook(this);
  }

  public static resolveWorktreeIdFromCwd(cwd = process.cwd()): string {
    return ActiveHeadResolver.resolveActiveWorktree(cwd);
  }

  public static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public indexFile(filePath: string, content: string, worktreeId?: string): boolean {
    const active = worktreeId || ActiveHeadResolver.resolveActiveWorktree();
    const norm = filePath.replace(/\\/g, '/');
    const ns = this.getNamespace(active);
    const hash = CodebaseMemoryEngine.hashContent(content);
    if (ns.fileHashes.get(norm) === hash) return false;

    ns.fileHashes.set(norm, hash);
    ns.fileContents.set(norm, content);
    const fp = GitFastSyncEngine.getFileFingerprint(norm);
    if (fp) ns.mtimeFingerprints.set(norm, fp);

    ns.indexer.indexFile(norm, content);
    ns.linker.linkSingleFile(norm, content);
    return true;
  }

  public removeFile(filePath: string, worktreeId?: string): boolean {
    const active = worktreeId || ActiveHeadResolver.resolveActiveWorktree();
    const norm = filePath.replace(/\\/g, '/');
    const ns = this.getNamespace(active);
    if (!ns.fileHashes.has(norm)) return false;

    ns.fileHashes.delete(norm);
    ns.fileContents.delete(norm);
    ns.mtimeFingerprints.delete(norm);
    delete ns.indexer.getDatabase().files[norm];
    ns.graph.removeFileEdges(norm);
    this.saveNamespaceToDisk(active);
    return true;
  }

  public indexDirectory(
    dirPath: string,
    worktreeId?: string
  ): { indexed: number; cached: number; fastSynced?: boolean } {
    return this.coldStartIndexer.indexDirectory(this, dirPath, worktreeId);
  }

  public ensureColdStartIndexed(repoRoot = process.cwd(), worktreeId?: string): Promise<ColdStartIndexResult> {
    const active = worktreeId || ActiveHeadResolver.resolveActiveWorktree();
    return this.coldStartIndexer.indexProjectRoot(this, { repoRoot, worktreeId: active });
  }

  public notifyFileChanged(filePath: string, content: string, worktreeId?: string): boolean {
    return this.writeThroughHook.handleFileWrite(filePath, content, worktreeId);
  }

  public notifyFileDeleted(filePath: string, worktreeId?: string): boolean {
    return this.writeThroughHook.handleFileDelete(filePath, worktreeId);
  }

  public queryMemory(symbol: string, options: MemoryQueryOptions = {}): MemoryQueryResult {
    const worktreeId = options.worktreeId || ActiveHeadResolver.resolveActiveWorktree();
    return executeMemoryQuery(this, this.adapters, symbol, options, worktreeId);
  }

  public pruneDeletedFiles(worktreeId?: string, cwd = process.cwd()): { prunedFiles: string[] } {
    const active = worktreeId || ActiveHeadResolver.resolveActiveWorktree();
    return { prunedFiles: MemoryAdapterResolver.pruneDeleted(this, active, cwd) };
  }
}
