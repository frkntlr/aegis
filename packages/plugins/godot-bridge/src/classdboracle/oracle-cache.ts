import * as fs from 'node:fs';
import * as path from 'node:path';

export interface OracleCacheOptions {
  cacheDir?: string;
  ttlMs?: number; // default: 24h
  maxSizeBytes?: number; // default: 50MB
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  godotVersion?: string;
}

export class OracleCache {
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private readonly maxSizeBytes: number;

  constructor(options: OracleCacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.resolve(process.cwd(), '.aegis', 'cache', 'godot');
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxSizeBytes = options.maxSizeBytes ?? 50 * 1024 * 1024;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  public getCacheDir(): string {
    return this.cacheDir;
  }

  public get<T>(key: string, expectedVersion?: string): T | undefined {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) return undefined;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (this.isExpired(entry) || this.isVersionMismatch(entry, expectedVersion)) {
        this.delete(key);
        return undefined;
      }
      return entry.data;
    } catch {
      this.delete(key);
      return undefined;
    }
  }

  public set<T>(key: string, data: T, godotVersion?: string): void {
    const filePath = this.getFilePath(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      godotVersion
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf8');
    this.pruneIfNeeded();
  }

  public has(key: string, expectedVersion?: string): boolean {
    return this.get(key, expectedVersion) !== undefined;
  }

  public delete(key: string): boolean {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      return true;
    }
    return false;
  }

  public clear(): void {
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const f of files) {
        fs.rmSync(path.join(this.cacheDir, f), { recursive: true, force: true });
      }
    }
  }

  public getStats(): { totalFiles: number; totalSizeBytes: number } {
    if (!fs.existsSync(this.cacheDir)) {
      return { totalFiles: 0, totalSizeBytes: 0 };
    }
    let totalFiles = 0;
    let totalSizeBytes = 0;
    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      const full = path.join(this.cacheDir, file);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) {
          totalFiles++;
          totalSizeBytes += stat.size;
        }
      } catch {
        // ignore unreadable files
      }
    }
    return { totalFiles, totalSizeBytes };
  }

  private isExpired<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.ttlMs;
  }

  private isVersionMismatch<T>(entry: CacheEntry<T>, expected?: string): boolean {
    if (!expected || !entry.godotVersion) return false;
    return entry.godotVersion !== expected;
  }

  private getFilePath(key: string): string {
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cacheDir, `${sanitized}.json`);
  }

  private pruneIfNeeded(): void {
    const stats = this.getStats();
    if (stats.totalSizeBytes <= this.maxSizeBytes) return;

    const files = fs.readdirSync(this.cacheDir)
      .map(f => {
        const full = path.join(this.cacheDir, f);
        return { path: full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime);

    let currentSize = stats.totalSizeBytes;
    for (const f of files) {
      if (currentSize <= this.maxSizeBytes * 0.8) break;
      try {
        const size = fs.statSync(f.path).size;
        fs.rmSync(f.path, { force: true });
        currentSize -= size;
      } catch {
        // ignore prune errors
      }
    }
  }
}
