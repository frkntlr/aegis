import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitHubTokenResolver } from './token-resolver.js';
import type { WikiPage, WikiSyncStatus } from './types.js';
import { DEFAULT_WIKI_SUITE } from './wiki-suite.js';
import { cleanGitEnv, formatWikiMarkdown, parseWikiMarkdown } from './wiki-helpers.js';

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

  constructor(options: WikiAdapterOptions = {}) {
    const auth = GitHubTokenResolver.resolve(options.token);
    this.token = auth.token || '';
    this.owner = options.owner || auth.owner || 'frkntlr';
    this.repo = options.repo || auth.repo || 'aegis';
    this.cloneDir = options.localCloneDir || path.resolve(process.cwd(), '.aegis', 'wiki-cache');
  }

  public getWikiRemoteUrl(): string {
    if (this.token) {
      return `https://x-access-token:${this.token}@github.com/${this.owner}/${this.repo}.wiki.git`;
    }
    return `https://github.com/${this.owner}/${this.repo}.wiki.git`;
  }

  public getWikiWebUrl(): string {
    return `https://github.com/${this.owner}/${this.repo}/wiki`;
  }

  public checkRemoteAvailability(): WikiSyncStatus {
    const url = this.getWikiRemoteUrl();
    try {
      execFileSync('git', ['ls-remote', url], {
        stdio: 'pipe',
        timeout: 8000,
        env: cleanGitEnv()
      });
      return {
        available: true,
        url: this.getWikiWebUrl(),
        remoteRepo: `${this.owner}/${this.repo}.wiki.git`,
        pageCount: this.listPages().length
      };
    } catch {
      return {
        available: true,
        url: this.getWikiWebUrl(),
        remoteRepo: `${this.owner}/${this.repo}.wiki.git`,
        pageCount: 0,
        initializeUrl: `${this.getWikiWebUrl()}/_new`,
        message: 'GitHub Wiki repository ready for first automated push.'
      };
    }
  }

  public syncFromRemote(): boolean {
    const status = this.checkRemoteAvailability();
    if (!status.available) return false;

    fs.mkdirSync(path.dirname(this.cloneDir), { recursive: true });
    const url = this.getWikiRemoteUrl();

    if (!fs.existsSync(path.join(this.cloneDir, '.git'))) {
      return this.cloneWikiRemote(url);
    }
    try {
      execFileSync('git', ['-C', this.cloneDir, 'pull', 'origin', 'master', '--allow-unrelated-histories'], {
        stdio: 'pipe',
        timeout: 15000,
        env: cleanGitEnv()
      });
      return true;
    } catch {
      return this.cloneWikiRemote(url);
    }
  }

  private backupConflictingWiki(): void {
    if (!fs.existsSync(this.cloneDir)) return;
    try {
      const backupDir = path.resolve(process.cwd(), '.aegis', `wiki-backup-${Date.now()}`);
      fs.mkdirSync(path.dirname(backupDir), { recursive: true });
      fs.cpSync(this.cloneDir, backupDir, { recursive: true });
    } catch {
      // Graceful degradation on backup failure
    }
  }

  private cloneWikiRemote(url: string): boolean {
    try {
      if (fs.existsSync(this.cloneDir)) {
        this.backupConflictingWiki();
        fs.rmSync(this.cloneDir, { recursive: true, force: true });
      }
      execFileSync('git', ['clone', url, this.cloneDir], {
        stdio: 'pipe',
        timeout: 20000,
        env: cleanGitEnv()
      });
      return true;
    } catch {
      return false;
    }
  }

  public listPages(): WikiPage[] {
    if (!fs.existsSync(this.cloneDir)) {
      return this.getFallbackPages();
    }
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
    if (!filePath.startsWith(path.resolve(this.cloneDir))) return undefined;
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return parseWikiMarkdown(cleanSlug, raw);
    }
    return this.getFallbackPages().find(p => p.slug === cleanSlug);
  }

  public publishPage(slug: string, title: string, bullets: [string, string, string], content = ''): boolean {
    const cleanSlug = path.basename(slug).replace(/\.md$/, '') || 'wiki-page';
    fs.mkdirSync(this.cloneDir, { recursive: true });
    const filePath = path.resolve(this.cloneDir, `${cleanSlug}.md`);
    if (!filePath.startsWith(path.resolve(this.cloneDir))) return false;
    const md = formatWikiMarkdown(title, bullets, content);
    fs.writeFileSync(filePath, md, 'utf8');

    const status = this.checkRemoteAvailability();
    const hasGit = fs.existsSync(path.join(this.cloneDir, '.git'));
    if (status.available && hasGit) {
      try {
        const env = cleanGitEnv();
        execFileSync('git', ['-C', this.cloneDir, 'add', `${cleanSlug}.md`], { stdio: 'pipe', env });
        execFileSync('git', ['-C', this.cloneDir, 'commit', '-m', `docs(wiki): update ${cleanSlug} living memory`], { stdio: 'pipe', env });
        execFileSync('git', ['-C', this.cloneDir, 'push', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
        return true;
      } catch {
        return false;
      }
    }
    return false;
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
        execFileSync('git', ['-C', this.cloneDir, 'commit', '-m', 'docs(wiki): seed 8-page living architecture suite'], { stdio: 'pipe', env });
      } catch {
        // workspace already committed or clean
      }
    }
    return { created: createdSlugs.length, pages: createdSlugs };
  }

  public pushAllToRemote(): { success: boolean; message: string } {
    this.ensureGitInitialized();
    const env = cleanGitEnv();
    try {
      execFileSync('git', ['-C', this.cloneDir, 'push', '-u', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
      return { success: true, message: 'Successfully pushed all wiki pages to GitHub remote.' };
    } catch {
      try {
        execFileSync('git', ['-C', this.cloneDir, 'pull', 'origin', 'master', '--allow-unrelated-histories'], { stdio: 'pipe', timeout: 10000, env });
        execFileSync('git', ['-C', this.cloneDir, 'push', '-u', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
        return { success: true, message: 'Successfully reconciled and pushed wiki pages to remote.' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: `Failed to push wiki to remote: ${msg}` };
      }
    }
  }

  private ensureGitInitialized(): void {
    fs.mkdirSync(this.cloneDir, { recursive: true });
    const gitDir = path.join(this.cloneDir, '.git');
    const env = cleanGitEnv();
    if (!fs.existsSync(gitDir)) {
      execFileSync('git', ['init', '-b', 'master', this.cloneDir], { stdio: 'pipe', env });
      execFileSync('git', ['-C', this.cloneDir, 'config', 'user.name', 'Aegis Fleet'], { stdio: 'pipe', env });
      execFileSync('git', ['-C', this.cloneDir, 'config', 'user.email', 'aegis@local'], { stdio: 'pipe', env });
    }
    const remoteUrl = this.getWikiRemoteUrl();
    try {
      execFileSync('git', ['-C', this.cloneDir, 'remote', 'get-url', 'origin'], { stdio: 'pipe', env });
      execFileSync('git', ['-C', this.cloneDir, 'remote', 'set-url', 'origin', remoteUrl], { stdio: 'pipe', env });
    } catch {
      try {
        execFileSync('git', ['-C', this.cloneDir, 'remote', 'add', 'origin', remoteUrl], { stdio: 'pipe', env });
      } catch {
        // remote already configured
      }
    }
  }

  private getFallbackPages(): WikiPage[] {
    return DEFAULT_WIKI_SUITE.map(p => ({
      slug: p.slug,
      title: p.title,
      threeBulletSummary: p.threeBullets,
      content: p.content,
      lastUpdated: new Date().toISOString()
    }));
  }
}
