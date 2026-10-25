import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitFastSyncEngine } from './git-fast-sync.js';
import type { SymbolIndexer } from './symbol-indexer.js';
import type { RelationalGraph } from './relational-graph.js';
import type { LruFileBuffer } from './lru-file-buffer.js';

export interface DiskNamespaceData {
  indexer: SymbolIndexer;
  graph: RelationalGraph;
  fileHashes: Map<string, string>;
  mtimeFingerprints: Map<string, string>;
  fileContents: LruFileBuffer;
  lastCommit?: string;
}

export class MemoryDiskStore {
  public static writeAtomic(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    try {
      fs.renameSync(tmpPath, filePath);
    } catch {
      fs.copyFileSync(tmpPath, filePath);
      try { fs.rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
    }
  }

  public static readSafe<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as T;
    } catch {
      try {
        const corruptPath = `${filePath}.corrupted.${Date.now()}`;
        try {
          fs.renameSync(filePath, corruptPath);
        } catch {
          fs.copyFileSync(filePath, corruptPath);
          try { fs.rmSync(filePath, { force: true }); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      return null;
    }
  }

  private static resolveSourceDir(id: string): string | null {
    const cacheDir = path.resolve(process.cwd(), '.aegis', 'memory', id);
    if (fs.existsSync(cacheDir)) return cacheDir;
    if (id === 'default') return null;

    const baseDir = path.resolve(process.cwd(), '.aegis', 'memory', 'default');
    if (fs.existsSync(baseDir)) return baseDir;
    return null;
  }

  public static load(id: string, ns: DiskNamespaceData, persistToDisk?: boolean): void {
    if (persistToDisk === false) return;
    const sourceDir = MemoryDiskStore.resolveSourceDir(id);
    if (!sourceDir) return;

    const symPath = path.join(sourceDir, 'symbols.json');
    const graphPath = path.join(sourceDir, 'graph.json');
    const metaPath = path.join(sourceDir, 'meta.json');

    if (fs.existsSync(symPath)) ns.indexer.loadCache(symPath);
    if (fs.existsSync(graphPath)) ns.graph.loadCache(graphPath);
    const meta = MemoryDiskStore.readSafe<{
      lastCommit?: string;
      hashes?: Record<string, string>;
      fingerprints?: Record<string, string>;
    }>(metaPath);
    if (meta) {
      if (meta.hashes) ns.fileHashes = new Map(Object.entries(meta.hashes));
      if (meta.fingerprints) ns.mtimeFingerprints = new Map(Object.entries(meta.fingerprints));
      if (meta.lastCommit) ns.lastCommit = meta.lastCommit;
    }
  }

  public static inherit(target: DiskNamespaceData, source: DiskNamespaceData): void {
    target.indexer.loadCacheData(source.indexer.getDatabase());
    target.graph.fromJSON(source.graph.toJSON());
    for (const [k, v] of source.fileHashes) target.fileHashes.set(k, v);
    for (const [k, v] of source.mtimeFingerprints) target.mtimeFingerprints.set(k, v);
    target.lastCommit = source.lastCommit;
  }

  public static save(id: string, ns: DiskNamespaceData, persistToDisk?: boolean): void {
    if (persistToDisk === false) return;
    const cacheDir = path.resolve(process.cwd(), '.aegis', 'memory', id);
    fs.mkdirSync(cacheDir, { recursive: true });
    ns.indexer.saveCache(path.join(cacheDir, 'symbols.json'));
    ns.graph.saveCache(path.join(cacheDir, 'graph.json'));
    const headCommit = GitFastSyncEngine.getHeadCommit();
    const meta = {
      lastCommit: headCommit || ns.lastCommit,
      hashes: Object.fromEntries(ns.fileHashes),
      fingerprints: Object.fromEntries(ns.mtimeFingerprints)
    };
    MemoryDiskStore.writeAtomic(path.join(cacheDir, 'meta.json'), meta);
  }
}
