/**
 * @file version-manager.ts
 * Automated version upgrade/grading, semver bumping, and monorepo version synchronization.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';

export type BumpType = 'patch' | 'minor' | 'major';

export interface VersionGradeResult {
  latestTag: string | null;
  upgradeAvailable: boolean;
  nextPatch: string;
  nextMinor: string;
}

export interface MonorepoSyncResult {
  updatedPackages: string[];
  previousVersion: string;
  newVersion: string;
}

export class VersionManager {
  public static bumpSemver(
    currentVersion: string,
    type: BumpType = 'patch'
  ): string {
    const clean = currentVersion.replace(/^v/, '').trim();
    const match = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
    let major = 0;
    let minor = 1;
    let patch = 0;

    if (match) {
      major = parseInt(match[1] || '0', 10);
      minor = parseInt(match[2] || '0', 10);
      patch = parseInt(match[3] || '0', 10);
    }

    if (type === 'major') {
      return `${major + 1}.0.0`;
    }
    if (type === 'minor') {
      return `${major}.${minor + 1}.0`;
    }
    return `${major}.${minor}.${patch + 1}`;
  }

  public static compareSemver(v1: string, v2: string): number {
    const parse = (v: string): [number, number, number] => {
      const clean = v.replace(/^v/, '').trim();
      const match = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!match) return [0, 0, 0];
      return [
        parseInt(match[1] || '0', 10),
        parseInt(match[2] || '0', 10),
        parseInt(match[3] || '0', 10)
      ];
    };
    const [maj1, min1, pat1] = parse(v1);
    const [maj2, min2, pat2] = parse(v2);
    if (maj1 !== maj2) return maj1 - maj2;
    if (min1 !== min2) return min1 - min2;
    return pat1 - pat2;
  }

  public static getLatestTag(repoRoot: string): string | null {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' };
    try {
      const desc = cp.execSync('git describe --tags --abbrev=0', {
        cwd: repoRoot, timeout: 5000, env, stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();
      if (desc) return desc;
    } catch { /* describe failed, try tag -l */ }

    try {
      const raw = cp.execSync('git tag -l "v*"', {
        cwd: repoRoot, timeout: 5000, env, stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();
      if (raw) {
        const tags = raw.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
        if (tags.length > 0) {
          tags.sort((a, b) => VersionManager.compareSemver(b, a));
          return tags[0] || null;
        }
      }
    } catch { /* tag query failed */ }

    return null;
  }

  public static checkVersionGrade(
    currentVersion: string,
    repoRoot: string
  ): VersionGradeResult {
    const latestTag = this.getLatestTag(repoRoot);
    const nextPatch = this.bumpSemver(currentVersion, 'patch');
    const nextMinor = this.bumpSemver(currentVersion, 'minor');
    const upgradeAvailable = latestTag !== null && this.compareSemver(latestTag, currentVersion) > 0;

    return { latestTag, upgradeAvailable, nextPatch, nextMinor };
  }

  public static syncMonorepoVersions(
    repoRoot: string,
    newVersion: string
  ): MonorepoSyncResult {
    const updatedPackages: string[] = [];
    let previousVersion = '0.1.0';

    const rootPkg = path.resolve(repoRoot, 'package.json');
    if (fs.existsSync(rootPkg)) {
      const res = this.updatePackageFile(rootPkg, newVersion);
      if (res) {
        previousVersion = res.prevVersion;
        updatedPackages.push(res.name);
      }
    }

    const pkgsDir = path.resolve(repoRoot, 'packages');
    if (fs.existsSync(pkgsDir)) {
      this.syncDirectoryPackages(pkgsDir, newVersion, updatedPackages);
    }

    return { updatedPackages, previousVersion, newVersion };
  }

  private static syncDirectoryPackages(dir: string, newVersion: string, updated: string[]): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') continue;
      const sub = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(sub);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        const pj = path.join(sub, 'package.json');
        if (fs.existsSync(pj)) {
          const res = this.updatePackageFile(pj, newVersion);
          if (res) updated.push(res.name);
        }
        this.syncDirectoryPackages(sub, newVersion, updated);
      }
    }
  }

  private static updatePackageFile(
    filePath: string,
    newVersion: string
  ): { name: string; prevVersion: string } | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      const name = parsed.name || path.basename(path.dirname(filePath));
      const prevVersion = parsed.version || '0.1.0';

      let updatedRaw: string;
      if (/"version":\s*"[^"]+"/.test(raw)) {
        updatedRaw = raw.replace(/"version":\s*"[^"]+"/, `"version": "${newVersion}"`);
      } else {
        parsed.version = newVersion;
        const eol = raw.includes('\r\n') ? '\r\n' : '\n';
        updatedRaw = JSON.stringify(parsed, null, 2);
        if (eol === '\r\n') updatedRaw = updatedRaw.replace(/\n/g, '\r\n');
        if (raw.endsWith('\n')) updatedRaw += eol;
      }

      fs.writeFileSync(filePath, updatedRaw, 'utf8');
      return { name, prevVersion };
    } catch {
      return null;
    }
  }
}
