/**
 * @file triage-cache-radar.ts
 * High-speed incremental content-digest radar cache for triage and cage checks.
 * Enforces rule-version salt and fast-stat zero-I/O fingerprinting.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CageViolation } from '@aegis/shared';

export interface QuotaAlert {
  file: string;
  lines: number;
  msg: string;
}

export interface TriageCacheEntry {
  mtimeMs: number;
  size: number;
  hash: string;
  violations: CageViolation[];
  quotaAlert?: QuotaAlert;
}

export interface TriageCacheData {
  version: string;
  engineHash: string;
  timestamp: string;
  files: Record<string, TriageCacheEntry>;
}

export interface CacheCheckResult {
  hit: boolean;
  cachedViolations?: CageViolation[];
  quotaAlert?: QuotaAlert;
}

export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function normalizeCachePath(p: string): string {
  return path.normalize(p).replace(/\\/g, '/');
}

export class TriageCacheRadar {
  private cacheFilePath: string;
  private currentEngineHash: string;
  private cacheData: TriageCacheData;
  private dirty = false;
  private hitCount = 0;
  private missCount = 0;

  constructor(options: { cacheDir?: string; engineRulesSalt?: string } = {}) {
    const baseDir = options.cacheDir || path.resolve(process.cwd(), '.aegis', 'cache');
    fs.mkdirSync(baseDir, { recursive: true });
    this.cacheFilePath = path.join(baseDir, 'triage-cache.json');
    this.currentEngineHash = this.computeEngineHash(options.engineRulesSalt || 'aegis-iron-cage-v2');
    this.cacheData = this.loadCache();
  }

  private computeEngineHash(salt: string): string {
    return crypto.createHash('sha256').update(salt).digest('hex').slice(0, 16);
  }

  private loadCache(): TriageCacheData {
    if (!fs.existsSync(this.cacheFilePath)) {
      return this.initFreshCache();
    }
    try {
      const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
      const parsed = JSON.parse(raw) as TriageCacheData;
      if (parsed.engineHash !== this.currentEngineHash || parsed.version !== '1.0.0') {
        return this.initFreshCache();
      }
      return parsed;
    } catch {
      return this.initFreshCache();
    }
  }

  private initFreshCache(): TriageCacheData {
    return {
      version: '1.0.0',
      engineHash: this.currentEngineHash,
      timestamp: new Date().toISOString(),
      files: {}
    };
  }

  public checkFileStat(filePath: string, mtimeMs: number, size: number): CacheCheckResult {
    const norm = normalizeCachePath(filePath);
    const entry = this.cacheData.files[norm];
    if (!entry) {
      this.missCount++;
      return { hit: false };
    }

    if (entry.mtimeMs === mtimeMs && entry.size === size) {
      this.hitCount++;
      return { hit: true, cachedViolations: entry.violations, quotaAlert: entry.quotaAlert };
    }

    this.missCount++;
    return { hit: false };
  }

  public checkFile(filePath: string, mtimeMs: number, size: number, content: string): CacheCheckResult {
    const norm = normalizeCachePath(filePath);
    const entry = this.cacheData.files[norm];
    if (!entry) {
      this.missCount++;
      return { hit: false };
    }

    if (entry.mtimeMs === mtimeMs && entry.size === size && entry.hash === fnv1a(content)) {
      this.hitCount++;
      return { hit: true, cachedViolations: entry.violations, quotaAlert: entry.quotaAlert };
    }

    this.missCount++;
    return { hit: false };
  }

  public recordFile(
    filePath: string,
    mtimeMs: number,
    size: number,
    content: string,
    violations: CageViolation[],
    quotaAlert?: QuotaAlert
  ): void {
    const norm = normalizeCachePath(filePath);
    this.cacheData.files[norm] = {
      mtimeMs,
      size,
      hash: fnv1a(content),
      violations,
      quotaAlert
    };
    this.dirty = true;
  }

  public flush(): void {
    if (!this.dirty) return;
    try {
      this.cacheData.timestamp = new Date().toISOString();
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cacheData, null, 2), 'utf8');
      this.dirty = false;
    } catch {
      // Safe fallback on filesystem write restrictions
    }
  }

  public invalidateAll(): void {
    this.cacheData = this.initFreshCache();
    this.dirty = true;
    this.flush();
  }

  public getStats(): { hits: number; misses: number; total: number; ratio: number } {
    const total = this.hitCount + this.missCount;
    const ratio = total > 0 ? this.hitCount / total : 0;
    return {
      hits: this.hitCount,
      misses: this.missCount,
      total,
      ratio
    };
  }
}
