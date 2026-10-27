/**
 * @file contract-drift-radar.ts
 * Streaming O(1) Memory Lockfile Hash Radar & Breaking Change Drift Detector.
 * Detects third-party package drift and breaking API changes before coding starts.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class CrlfNormalizerStream extends Transform {
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void
  ): void {
    if (!chunk.includes(0x0d)) {
      callback(null, chunk);
      return;
    }
    callback(null, Buffer.from(chunk.filter(b => b !== 0x0d)));
  }
}

export interface LockfileMetadata {
  path: string;
  hash: string;
  size: number;
  mtimeMs: number;
}

export interface ContractSignature {
  library: string;
  symbol: string;
  parameters: string[];
  returnType?: string;
}

export interface DriftDetectionResult {
  hasDrift: boolean;
  changedFiles: string[];
  breakingChanges: string[];
  warnings: string[];
  shouldBlock: boolean;
}

export interface DriftRadarOptions {
  projectRoot?: string;
  cacheDir?: string;
  customLockfiles?: string[];
  streamRunner?: (filePath: string) => Promise<string>;
}

export class ContractDriftRadar {
  private readonly projectRoot: string;
  private readonly cacheDir: string;
  private readonly streamRunner?: (filePath: string) => Promise<string>;

  constructor(options: DriftRadarOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.cacheDir = options.cacheDir ?? path.join(this.projectRoot, '.aegis', 'cache', 'context7');
    this.streamRunner = options.streamRunner;
  }

  public static async computeFileHashStream(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    const normalizer = new CrlfNormalizerStream();
    await pipeline(stream, normalizer, hash);
    return hash.digest('hex');
  }

  private async hashWithRetry(filePath: string, maxAttempts = 3): Promise<string | null> {
    if (this.streamRunner) {
      try { return await this.streamRunner(filePath); } catch { return null; }
    }
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await ContractDriftRadar.computeFileHashStream(filePath);
      } catch {
        await new Promise(r => setTimeout(r, 20 * (i + 1)));
      }
    }
    return null;
  }

  public resolveLockfiles(custom?: string[]): string[] {
    const candidates = custom ?? [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lock',
      'bun.lockb',
      'packages.lock.json',
      'Directory.Packages.props',
      'project.godot',
      'export_presets.cfg',
      'Cargo.lock'
    ];
    return candidates
      .map(rel => (path.isAbsolute(rel) ? rel : path.join(this.projectRoot, rel)))
      .filter(p => fs.existsSync(p));
  }

  public async scanLockfiles(customLockfiles?: string[]): Promise<LockfileMetadata[]> {
    const files = this.resolveLockfiles(customLockfiles);
    const results: LockfileMetadata[] = [];

    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        const hash = await this.hashWithRetry(file);
        if (hash) {
          results.push({ path: file, hash, size: stat.size, mtimeMs: stat.mtimeMs });
        }
      } catch {
        // Skip unreadable files
      }
    }
    return results;
  }

  public loadCachedLedger(): Record<string, string> {
    const ledgerPath = path.join(this.cacheDir, 'lockfiles.hash');
    if (!fs.existsSync(ledgerPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }

  public saveLedger(ledger: Record<string, string>): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    const ledgerPath = path.join(this.cacheDir, 'lockfiles.hash');
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8');
  }

  public static compareSignatures(
    oldSigs: ContractSignature[],
    newSigs: ContractSignature[]
  ): { breaking: string[]; warnings: string[] } {
    const breaking: string[] = [];
    const warnings: string[] = [];
    const newMap = new Map(newSigs.map(s => [`${s.library}::${s.symbol}`, s]));

    for (const old of oldSigs) {
      const key = `${old.library}::${old.symbol}`;
      const next = newMap.get(key);
      if (!next) {
        breaking.push(`REMOVED: ${key} was deleted in upstream contract`);
        continue;
      }
      if (old.parameters.length !== next.parameters.length) {
        breaking.push(`ARITY_CHANGED: ${key} params changed (${old.parameters.length} -> ${next.parameters.length})`);
      }
      if (old.returnType && next.returnType && old.returnType !== next.returnType) {
        warnings.push(`RETURN_CHANGED: ${key} return type changed (${old.returnType} -> ${next.returnType})`);
      }
    }
    return { breaking, warnings };
  }

  public async evaluateDrift(
    oldSigs: ContractSignature[] = [],
    newSigs: ContractSignature[] = [],
    customLockfiles?: string[]
  ): Promise<DriftDetectionResult> {
    const current = await this.scanLockfiles(customLockfiles);
    const cached = this.loadCachedLedger();
    const changedFiles: string[] = [];

    for (const meta of current) {
      const prevHash = cached[meta.path];
      if (!prevHash || prevHash !== meta.hash) {
        changedFiles.push(meta.path);
      }
    }

    const { breaking, warnings } = ContractDriftRadar.compareSignatures(oldSigs, newSigs);
    const hasDrift = changedFiles.length > 0 || breaking.length > 0;
    const shouldBlock = breaking.length > 0;

    return {
      hasDrift,
      changedFiles,
      breakingChanges: breaking,
      warnings,
      shouldBlock
    };
  }
}
