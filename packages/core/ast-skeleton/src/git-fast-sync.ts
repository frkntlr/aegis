import * as cp from 'node:child_process';
import * as fs from 'node:fs';

export interface FastSyncEvaluation {
  canSkipScan: boolean;
  dirtyFiles: string[];
  headCommit?: string;
}

export class GitFastSyncEngine {
  private static statusCache: { cwd: string; head: string; timestamp: number; files: string[] } | null = null;
  private static readonly CACHE_TTL_MS = 1000;

  public static clearCache(): void {
    GitFastSyncEngine.statusCache = null;
  }

  public static getHeadCommit(cwd = process.cwd()): string | null {
    try {
      return cp.execSync('git rev-parse HEAD', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000
      }).trim();
    } catch {
      return null;
    }
  }

  private static parseStatusLine(line: string): string | null {
    if (!line.trim()) return null;
    let filePath = line.slice(3).trim().replace(/^"/, '').replace(/"$/, '');
    if (filePath.includes('->')) {
      const parts = filePath.split('->');
      filePath = parts[parts.length - 1].trim().replace(/^"/, '').replace(/"$/, '');
    }
    return filePath ? filePath.replace(/\\/g, '/') : null;
  }

  public static getDeletedFiles(cwd = process.cwd()): string[] {
    try {
      const output = cp.execSync('git status --porcelain', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000
      });
      const deleted: string[] = [];
      for (const line of output.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const status = line.slice(0, 2);
        if (status.includes('D')) {
          const parsed = GitFastSyncEngine.parseStatusLine(line);
          if (parsed) deleted.push(parsed);
        }
      }
      return deleted;
    } catch {
      return [];
    }
  }

  public static getPorcelainStatus(cwd = process.cwd(), forceRefresh = false): string[] | null {
    const now = Date.now();
    const head = GitFastSyncEngine.getHeadCommit(cwd) || '';
    if (!forceRefresh && GitFastSyncEngine.statusCache &&
        GitFastSyncEngine.statusCache.cwd === cwd &&
        GitFastSyncEngine.statusCache.head === head &&
        now - GitFastSyncEngine.statusCache.timestamp < GitFastSyncEngine.CACHE_TTL_MS) {
      return [...GitFastSyncEngine.statusCache.files];
    }

    try {
      const output = cp.execSync('git status --porcelain', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000
      });
      const files: string[] = [];
      for (const line of output.split(/\r?\n/)) {
        const parsed = GitFastSyncEngine.parseStatusLine(line);
        if (parsed) files.push(parsed);
      }
      GitFastSyncEngine.statusCache = { cwd, head, timestamp: now, files };
      return files;
    } catch {
      return null;
    }
  }

  public static evaluateFastSync(lastCommit: string | undefined, cwd = process.cwd()): FastSyncEvaluation {
    const head = GitFastSyncEngine.getHeadCommit(cwd);
    if (!head) {
      return { canSkipScan: false, dirtyFiles: [] };
    }

    const dirtyFiles = GitFastSyncEngine.getPorcelainStatus(cwd);
    if (dirtyFiles === null) {
      return { canSkipScan: false, dirtyFiles: [], headCommit: head };
    }

    const isCommitEqual = Boolean(lastCommit && lastCommit === head);
    const isClean = dirtyFiles.length === 0;

    if (isCommitEqual && isClean) {
      return { canSkipScan: true, dirtyFiles: [], headCommit: head };
    }

    return {
      canSkipScan: false,
      dirtyFiles,
      headCommit: head
    };
  }

  public static getFileFingerprint(filePath: string): string | null {
    try {
      const st = fs.statSync(filePath);
      return `${Math.floor(st.mtimeMs)}:${st.size}`;
    } catch {
      return null;
    }
  }
}
