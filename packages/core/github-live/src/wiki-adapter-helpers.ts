import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, resolveSafeAegisDir } from '@aegis/shared';
import { execFileSync } from 'node:child_process';
import type { WikiPage } from './types.js';
import { DEFAULT_WIKI_SUITE } from './wiki-suite.js';
import { cleanGitEnv } from './wiki-helpers.js';

export function ensureWikiGitInitialized(cloneDir: string, remoteUrl: string): void {
  fs.mkdirSync(cloneDir, { recursive: true });
  const gitDir = path.join(cloneDir, '.git');
  const env = cleanGitEnv();
  if (!fs.existsSync(gitDir)) {
    execFileSync('git', ['init', '-b', 'master', cloneDir], { stdio: 'pipe', env });
    execFileSync('git', ['-C', cloneDir, 'config', 'user.name', 'Aegis Fleet'], { stdio: 'pipe', env });
    execFileSync('git', ['-C', cloneDir, 'config', 'user.email', 'aegis@local'], { stdio: 'pipe', env });
  }
  try {
    execFileSync('git', ['-C', cloneDir, 'remote', 'get-url', 'origin'], { stdio: 'pipe', env });
    execFileSync('git', ['-C', cloneDir, 'remote', 'set-url', 'origin', remoteUrl], { stdio: 'pipe', env });
  } catch {
    try {
      execFileSync('git', ['-C', cloneDir, 'remote', 'add', 'origin', remoteUrl], { stdio: 'pipe', env });
    } catch (err: unknown) {
      debugLogIgnored('wiki-adapter:remoteAdd', err);
    }
  }
}

export function backupConflictingWikiDir(cloneDir: string): void {
  if (!fs.existsSync(cloneDir)) return;
  try {
    const backupDir = path.join(resolveSafeAegisDir(), `wiki-backup-${Date.now()}`);
    fs.mkdirSync(path.dirname(backupDir), { recursive: true });
    fs.cpSync(cloneDir, backupDir, { recursive: true });
  } catch (err: unknown) {
    debugLogIgnored('wiki-adapter:backupConflictingWiki', err);
  }
}

export function buildFallbackWikiPages(): WikiPage[] {
  return DEFAULT_WIKI_SUITE.map((p) => ({
    slug: p.slug,
    title: p.title,
    threeBulletSummary: p.threeBullets,
    content: p.content,
    lastUpdated: new Date().toISOString()
  }));
}
