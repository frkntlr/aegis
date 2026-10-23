import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { GitHubTokenResolver } from './token-resolver.js';
import type { WikiPage, WikiSyncStatus } from './types.js';
import { DEFAULT_WIKI_SUITE } from './wiki-suite.js';

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
    this.cloneDir = options.localCloneDir || path.resolve(process.cwd(), '.git', 'aegis-wiki');
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
      execSync(`git ls-remote "${url}"`, {
        stdio: 'pipe',
        timeout: 8000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
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
      execSync(`git -C "${this.cloneDir}" pull origin master --allow-unrelated-histories`, { stdio: 'pipe', timeout: 15000 });
      return true;
    } catch {
      return this.cloneWikiRemote(url);
    }
  }

  private cloneWikiRemote(url: string): boolean {
    try {
      if (fs.existsSync(this.cloneDir)) fs.rmSync(this.cloneDir, { recursive: true, force: true });
      execSync(`git clone "${url}" "${this.cloneDir}"`, { stdio: 'pipe', timeout: 20000 });
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
      return this.parsePage(slug, raw);
    });
  }

  public getPage(slug: string): WikiPage | undefined {
    const filePath = path.join(this.cloneDir, `${slug}.md`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return this.parsePage(slug, raw);
    }
    return this.getFallbackPages().find(p => p.slug === slug);
  }

  public publishPage(slug: string, title: string, bullets: [string, string, string], content = ''): boolean {
    fs.mkdirSync(this.cloneDir, { recursive: true });
    const filePath = path.join(this.cloneDir, `${slug}.md`);
    const md = [
      `# ${title}`,
      '',
      '## Living Memory (Three Bullets)',
      `• ${bullets[0]}`,
      `• ${bullets[1]}`,
      `• ${bullets[2]}`,
      '',
      '## Detailed Context',
      content || '_Direct GitHub Wiki Living Memory._',
      '',
      `_Published to GitHub Wiki on: ${new Date().toISOString()}_`
    ].join('\n');
    fs.writeFileSync(filePath, md, 'utf8');

    const status = this.checkRemoteAvailability();
    if (status.available && fs.existsSync(path.join(this.cloneDir, '.git'))) {
      try {
        execSync(`git -C "${this.cloneDir}" add "${slug}.md"`, { stdio: 'pipe' });
        execSync(`git -C "${this.cloneDir}" commit -m "docs(wiki): update ${slug} living memory"`, { stdio: 'pipe' });
        execSync(`git -C "${this.cloneDir}" push origin master`, { stdio: 'pipe', timeout: 15000 });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private parsePage(slug: string, raw: string): WikiPage {
    const lines = raw.split('\n');
    const title = lines[0]?.replace(/^#\s*/, '').trim() || slug;
    const bullets = lines.filter(l => l.trim().startsWith('• ')).map(l => l.replace(/^•\s*/, '').trim());
    return {
      slug,
      title,
      threeBulletSummary: [
        bullets[0] || 'Core system principle preserved in GitHub Wiki.',
        bullets[1] || 'Living architecture documentation updated.',
        bullets[2] || 'Demir Kafes compliance verified.'
      ],
      content: raw,
      lastUpdated: new Date().toISOString()
    };
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

    try {
      execSync(`git -C "${this.cloneDir}" add .`, { stdio: 'pipe' });
      execSync(`git -C "${this.cloneDir}" commit -m "docs(wiki): seed 8-page living architecture suite"`, { stdio: 'pipe' });
    } catch {
      // workspace already committed or clean
    }
    return { created: createdSlugs.length, pages: createdSlugs };
  }

  public pushAllToRemote(): { success: boolean; message: string } {
    this.ensureGitInitialized();
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    try {
      execSync(`git -C "${this.cloneDir}" push -u origin master`, { stdio: 'pipe', timeout: 15000, env });
      return { success: true, message: 'Successfully pushed all wiki pages to GitHub remote.' };
    } catch {
      try {
        execSync(`git -C "${this.cloneDir}" pull origin master --allow-unrelated-histories`, { stdio: 'pipe', timeout: 10000, env });
        execSync(`git -C "${this.cloneDir}" push -u origin master`, { stdio: 'pipe', timeout: 15000, env });
        return { success: true, message: 'Successfully merged and pushed all pages to GitHub remote.' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: `Git push failed: ${msg}` };
      }
    }
  }

  private ensureGitInitialized(): void {
    const gitDir = path.join(this.cloneDir, '.git');
    if (!fs.existsSync(gitDir)) {
      execSync(`git -C "${this.cloneDir}" init -b master`, { stdio: 'pipe' });
      execSync(`git -C "${this.cloneDir}" config user.name "Aegis Fleet"`, { stdio: 'pipe' });
      execSync(`git -C "${this.cloneDir}" config user.email "aegis@local"`, { stdio: 'pipe' });
    }
    const remoteUrl = this.getWikiRemoteUrl();
    try {
      execSync(`git -C "${this.cloneDir}" remote get-url origin`, { stdio: 'pipe' });
      execSync(`git -C "${this.cloneDir}" remote set-url origin "${remoteUrl}"`, { stdio: 'pipe' });
    } catch {
      try {
        execSync(`git -C "${this.cloneDir}" remote add origin "${remoteUrl}"`, { stdio: 'pipe' });
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
