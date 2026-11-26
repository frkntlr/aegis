import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, resolveSafeAegisDir } from '@aegis/shared';
import { execFileSync } from 'node:child_process';
import { GitHubTokenResolver } from './token-resolver.js';
import type { WikiFastSyncResult, WikiPage, WikiSyncOptions, WikiSyncStatus } from './types.js';
import { DEFAULT_WIKI_SUITE } from './wiki-suite.js';
import {
  buildGitAuthEnv,
  cleanGitEnv,
  formatWikiMarkdown,
  isPathInsideDir,
  parseWikiMarkdown,
  redactGitToken
} from './wiki-helpers.js';
import { executeFastReconcile, WikiSyncRadar } from './wiki-sync-radar.js';
import {
  backupConflictingWikiDir,
  buildFallbackWikiPages,
  ensureWikiGitInitialized
} from './wiki-adapter-helpers.js';

export interface WikiAdapterOptions {
  token?: string;
  owner?: string;
  repo?: string;
  localCloneDir?: string;
}

export class GitHubWikiLiveAdapter {
  private token: string;
  private owner: string;
  private repo: string;
  private cloneDir: string;
  private cachedAvailability?: WikiSyncStatus;
  private cachedAvailabilityTime = 0;

  constructor(options: WikiAdapterOptions = {}) {
    const auth = GitHubTokenResolver.resolve(options.token);
    this.token = auth.token || '';
    this.owner = options.owner || auth.owner || 'frkntlr';
    this.repo = options.repo || auth.repo || 'aegis';
    this.cloneDir = options.localCloneDir || path.join(resolveSafeAegisDir(), 'wiki-cache');
  }

  public getWikiRemoteUrl(): string {
    return `https://github.com/${this.owner}/${this.repo}.wiki.git`;
  }

  private getGitEnv(): NodeJS.ProcessEnv {
    return buildGitAuthEnv(this.token);
  }

  public getWikiWebUrl(): string {
    return `https://github.com/${this.owner}/${this.repo}/wiki`;
  }

  public checkRemoteAvailability(): WikiSyncStatus {
    if (this.cachedAvailability && Date.now() - this.cachedAvailabilityTime < 120_000) {
      return this.cachedAvailability;
    }
    const url = this.getWikiRemoteUrl();
    try {
      execFileSync('git', ['ls-remote', url], { stdio: 'pipe', timeout: 8000, env: this.getGitEnv() });
      this.cachedAvailability = {
        available: true,
        url: this.getWikiWebUrl(),
        remoteRepo: `${this.owner}/${this.repo}.wiki.git`,
        pageCount: this.listPages().length
      };
    } catch (err: unknown) {
      debugLogIgnored('wiki-adapter:checkRemoteAvailability', err);
      this.cachedAvailability = {
        available: false,
        url: this.getWikiWebUrl(),
        remoteRepo: `${this.owner}/${this.repo}.wiki.git`,
        pageCount: 0,
        initializeUrl: `${this.getWikiWebUrl()}/_new`,
        message: 'GitHub Wiki availability could not be confirmed. Check access, network and wiki initialization.'
      };
    }
    this.cachedAvailabilityTime = Date.now();
    return this.cachedAvailability;
  }

  public fastSync(options: WikiSyncOptions = {}): WikiFastSyncResult {
    this.ensureGitInitialized();
    return executeFastReconcile({
      cloneDir: this.cloneDir,
      remoteUrl: this.getWikiRemoteUrl(),
      remoteRepo: `${this.owner}/${this.repo}.wiki.git`,
      gitEnv: this.getGitEnv(),
      token: this.token,
      options
    });
  }

  public syncFromRemote(): boolean {
    fs.mkdirSync(path.dirname(this.cloneDir), { recursive: true });
    const url = this.getWikiRemoteUrl();
    if (!fs.existsSync(path.join(this.cloneDir, '.git'))) {
      return this.cloneWikiRemote(url);
    }
    const env = this.getGitEnv();
    try {
      execFileSync('git', ['-C', this.cloneDir, 'remote', 'set-url', 'origin', url], { stdio: 'pipe', env });
      execFileSync('git', ['-C', this.cloneDir, 'pull', 'origin', 'master', '--allow-unrelated-histories'], {
        stdio: 'pipe',
        timeout: 15000,
        env
      });
      return true;
    } catch (err: unknown) {
      debugLogIgnored('wiki-adapter:syncFromRemote', err);
      return this.cloneWikiRemote(url);
    }
  }

  private backupConflictingWiki(): void {
    backupConflictingWikiDir(this.cloneDir);
  }

  private cloneWikiRemote(url: string): boolean {
    try {
      if (fs.existsSync(this.cloneDir)) {
        this.backupConflictingWiki();
        fs.rmSync(this.cloneDir, { recursive: true, force: true });
      }
      execFileSync('git', ['clone', url, this.cloneDir], { stdio: 'pipe', timeout: 20000, env: this.getGitEnv() });
      return true;
    } catch (err: unknown) {
      debugLogIgnored('wiki-adapter:cloneWikiRemote', err);
      return false;
    }
  }

  public listPages(): WikiPage[] {
    if (!fs.existsSync(this.cloneDir)) return this.getFallbackPages();
    const files = fs.readdirSync(this.cloneDir).filter(f => f.endsWith('.md') && !f.startsWith('.'));
    if (files.length === 0) return this.getFallbackPages();

    return files.map(f => {
      const slug = path.basename(f, '.md');
      const raw = fs.readFileSync(path.join(this.cloneDir, f), 'utf8');
      return parseWikiMarkdown(slug, raw);
    });
  }

  public getPage(slug: string): WikiPage | undefined {
    const cleanSlug = path.basename(slug).replace(/\.md$/, '');
    const filePath = path.resolve(this.cloneDir, `${cleanSlug}.md`);
    if (!isPathInsideDir(this.cloneDir, filePath)) return undefined;
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return parseWikiMarkdown(cleanSlug, raw);
    }
    return this.getFallbackPages().find(p => p.slug === cleanSlug);
  }

  public publishPage(
    slug: string,
    title: string,
    bullets: [string, string, string],
    content = '',
    pushImmediate = false
  ): boolean {
    const cleanSlug = path.basename(slug).replace(/\.md$/, '') || 'wiki-page';
    fs.mkdirSync(this.cloneDir, { recursive: true });
    const filePath = path.resolve(this.cloneDir, `${cleanSlug}.md`);
    if (!isPathInsideDir(this.cloneDir, filePath)) return false;
    const formatted = formatWikiMarkdown(title, bullets, content);
    const withoutStamp = (text: string): string => text.replace(/_(?:Published to GitHub Wiki|Cached locally) on: [^\n]+_\s*$/, '');
    const unchanged = fs.existsSync(filePath) && withoutStamp(fs.readFileSync(filePath, 'utf8')) === withoutStamp(formatted);
    if (unchanged && !pushImmediate) return true;
    if (!unchanged) fs.writeFileSync(filePath, formatted, 'utf8');

    if (!fs.existsSync(path.join(this.cloneDir, '.git'))) return !pushImmediate;
    try {
      const env = this.getGitEnv();
      if (!unchanged) {
        execFileSync('git', ['-C', this.cloneDir, 'add', `${cleanSlug}.md`], { stdio: 'pipe', env });
        execFileSync('git', ['-C', this.cloneDir, 'commit', '-m', `docs(wiki): update ${cleanSlug} living memory`], { stdio: 'pipe', env });
      }
      if (pushImmediate) {
        execFileSync('git', ['-C', this.cloneDir, 'push', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
      }
      return true;
    } catch (err: unknown) {
      debugLogIgnored('wiki-adapter:publishPage', err);
      return false;
    }
  }

  public seedComprehensiveWikiSuite(): { created: number; pages: string[] } {
    fs.mkdirSync(this.cloneDir, { recursive: true });
    this.ensureGitInitialized();
    const createdSlugs: string[] = [];

    for (const page of DEFAULT_WIKI_SUITE) {
      const filePath = path.join(this.cloneDir, `${page.slug}.md`);
      const md = [
        `# ${page.title}`,
        '',
        '## Living Memory (Three Bullets)',
        `• ${page.threeBullets[0]}`,
        `• ${page.threeBullets[1]}`,
        `• ${page.threeBullets[2]}`,
        '',
        page.content,
        '',
        `_Published to Aegis Living Memory on: ${new Date().toISOString()}_`
      ].join('\n');
      fs.writeFileSync(filePath, md, 'utf8');
      createdSlugs.push(page.slug);
    }

    if (fs.existsSync(path.join(this.cloneDir, '.git'))) {
      try {
        const env = cleanGitEnv();
        execFileSync('git', ['-C', this.cloneDir, 'add', '.'], { stdio: 'pipe', env });
        execFileSync('git', ['-C', this.cloneDir, 'commit', '-m', 'docs(wiki): seed 13-page living architecture suite'], { stdio: 'pipe', env });
      } catch (err: unknown) {
        debugLogIgnored('wiki-adapter:seedCommit', err);
      }
    }
    return { created: createdSlugs.length, pages: createdSlugs };
  }

  public pushAllToRemote(): { success: boolean; message: string } {
    this.ensureGitInitialized();
    if (WikiSyncRadar.isLocalDirty(this.cloneDir)) {
      WikiSyncRadar.stageAndCommitDirty(this.cloneDir);
    }
    const div = WikiSyncRadar.getCommitDivergence(this.cloneDir);
    if (div.ahead === 0) {
      return { success: true, message: 'Remote already up-to-date with local wiki memory.' };
    }
    const env = this.getGitEnv();
    try {
      execFileSync('git', ['-C', this.cloneDir, 'push', '-u', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
      return { success: true, message: 'Successfully pushed all wiki pages to GitHub remote.' };
    } catch {
      try {
        execFileSync('git', ['-C', this.cloneDir, 'pull', 'origin', 'master', '--allow-unrelated-histories'], { stdio: 'pipe', timeout: 10000, env });
        execFileSync('git', ['-C', this.cloneDir, 'push', '-u', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
        return { success: true, message: 'Successfully reconciled and pushed wiki pages to remote.' };
      } catch (err: unknown) {
        const msg = redactGitToken(err instanceof Error ? err.message : String(err), this.token);
        return { success: false, message: `Failed to push wiki to remote: ${msg}` };
      }
    }
  }

  private ensureGitInitialized(): void {
    ensureWikiGitInitialized(this.cloneDir, this.getWikiRemoteUrl());
  }

  private getFallbackPages(): WikiPage[] {
    return buildFallbackWikiPages();
  }
}
