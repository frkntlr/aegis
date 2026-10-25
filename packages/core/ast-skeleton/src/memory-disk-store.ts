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
  public static load(id: string, ns: DiskNamespaceData, persistToDisk?: boolean): void {
    if (persistToDisk === false) return;
    const cacheDir = path.resolve(process.cwd(), '.aegis', 'memory', id);
    const symPath = path.join(cacheDir, 'symbols.json');
    const graphPath = path.join(cacheDir, 'graph.json');
    const metaPath = path.join(cacheDir, 'meta.json');
    if (fs.existsSync(symPath)) ns.indexer.loadCache(symPath);
    if (fs.existsSync(graphPath)) ns.graph.loadCache(graphPath);
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.hashes) ns.fileHashes = new Map(Object.entries(meta.hashes));
        if (meta.fingerprints) ns.mtimeFingerprints = new Map(Object.entries(meta.fingerprints));
        if (meta.lastCommit) ns.lastCommit = meta.lastCommit;
      } catch { /* ignore parse error */ }
    }
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
    fs.writeFileSync(path.join(cacheDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }
}
