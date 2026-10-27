/**
 * @file multi-language-metadata-manager.ts
 * Multi-Language Ecosystem Metadata Manager with Isolated Delta Invalidation.
 * Tracks npm, Godot, and NuGet dependencies independently in metadata.lock.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export type EcosystemType = 'npm' | 'godot' | 'nuget';

export interface EcosystemManifests {
  type: EcosystemType;
  relativeFiles: string[];
}

export interface MetadataLockEntry {
  ecosystem: EcosystemType;
  compositeHash: string;
  lastUpdated: string;
}

export interface MetadataLockLedger {
  version: number;
  ecosystems: Record<EcosystemType, MetadataLockEntry>;
}

export interface MetadataManagerOptions {
  projectRoot?: string;
  cacheDir?: string;
  fileReader?: (filePath: string) => string | null;
}

export class MultiLanguageMetadataManager {
  private readonly projectRoot: string;
  private readonly cacheDir: string;
  private readonly fileReader?: (filePath: string) => string | null;

  public static readonly ECOSYSTEM_DEFINITIONS: EcosystemManifests[] = [
    { type: 'npm', relativeFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'] },
    { type: 'godot', relativeFiles: ['project.godot', 'export_presets.cfg'] },
    { type: 'nuget', relativeFiles: ['packages.lock.json', 'Directory.Packages.props'] }
  ];

  constructor(options: MetadataManagerOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.cacheDir = options.cacheDir ?? path.join(this.projectRoot, '.aegis', 'cache');
    this.fileReader = options.fileReader;
  }

  private readFile(targetPath: string): string | null {
    if (this.fileReader) return this.fileReader(targetPath);
    if (!fs.existsSync(targetPath)) return null;
    try {
      return fs.readFileSync(targetPath, 'utf8');
    } catch {
      return null;
    }
  }

  public computeEcosystemHash(eco: EcosystemType): string {
    const def = MultiLanguageMetadataManager.ECOSYSTEM_DEFINITIONS.find(d => d.type === eco);
    if (!def) return '';

    const hasher = crypto.createHash('sha256');
    let hasContent = false;

    for (const rel of def.relativeFiles) {
      const full = path.join(this.projectRoot, rel);
      const content = this.readFile(full);
      if (content !== null) {
        haserUpdate(hasher, rel, content);
        hasContent = true;
      }
    }

    return hasContent ? hasher.digest('hex') : 'empty';
  }

  public loadLockLedger(): MetadataLockLedger {
    const lockPath = path.join(this.cacheDir, 'metadata.lock');
    if (!fs.existsSync(lockPath)) return this.createEmptyLedger();
    try {
      return JSON.parse(fs.readFileSync(lockPath, 'utf8')) as MetadataLockLedger;
    } catch {
      return this.createEmptyLedger();
    }
  }

  public saveLockLedger(ledger: MetadataLockLedger): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    const lockPath = path.join(this.cacheDir, 'metadata.lock');
    fs.writeFileSync(lockPath, JSON.stringify(ledger, null, 2), 'utf8');
  }

  public checkEcosystemDrift(): { drifted: EcosystemType[]; ledger: MetadataLockLedger } {
    const currentLedger = this.loadLockLedger();
    const drifted: EcosystemType[] = [];

    for (const def of MultiLanguageMetadataManager.ECOSYSTEM_DEFINITIONS) {
      const currentHash = this.computeEcosystemHash(def.type);
      const prev = currentLedger.ecosystems[def.type];
      if (!prev || prev.compositeHash !== currentHash) {
        drifted.push(def.type);
        currentLedger.ecosystems[def.type] = {
          ecosystem: def.type,
          compositeHash: currentHash,
          lastUpdated: new Date().toISOString()
        };
      }
    }

    return { drifted, ledger: currentLedger };
  }

  public invalidateEcosystemCache(eco: EcosystemType): boolean {
    const ecoDir = path.join(this.cacheDir, 'context7', eco);
    if (fs.existsSync(ecoDir)) {
      try {
        fs.rmSync(ecoDir, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  public checkDependencyLock(locksPath?: string): { isLocked: boolean; holder?: string } {
    const file = locksPath ?? path.join(this.projectRoot, '.aegis', 'locks.json');
    if (!fs.existsSync(file)) return { isLocked: false };
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
      const holder = json['deps'] || json['lock:deps'];
      return { isLocked: Boolean(holder), holder };
    } catch {
      return { isLocked: false };
    }
  }

  private createEmptyLedger(): MetadataLockLedger {
    return {
      version: 1,
      ecosystems: {
        npm: { ecosystem: 'npm', compositeHash: '', lastUpdated: '' },
        godot: { ecosystem: 'godot', compositeHash: '', lastUpdated: '' },
        nuget: { ecosystem: 'nuget', compositeHash: '', lastUpdated: '' }
      }
    };
  }
}

function haserUpdate(hasher: crypto.Hash, rel: string, content: string): void {
  hasher.update(rel);
  hasher.update(':');
  hasher.update(content.replace(/\r\n/g, '\n'));
}
