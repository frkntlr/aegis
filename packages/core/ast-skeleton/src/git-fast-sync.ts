import * as cp from 'node:child_process';
import * as fs from 'node:fs';

export interface FastSyncEvaluation {
  canSkipScan: boolean;
  dirtyFiles: string[];
  headCommit?: string;
}

export class GitFastSyncEngine {
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

  public static getPorcelainStatus(cwd = process.cwd()): string[] | null {
    try {
      const output = cp.execSync('git status --porcelain', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000
      });
      const files: string[] = [];
      for (const line of output.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const filePath = line.slice(3).trim().replace(/^"/, '').replace(/"$/, '');
        if (filePath) files.push(filePath.replace(/\\/g, '/'));
      }
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
