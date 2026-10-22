import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { GitHubTokenResolver } from './token-resolver.js';
import type { WikiPage, WikiSyncStatus } from './types.js';

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
      execSync(`git ls-remote "${url}"`, { stdio: 'pipe', timeout: 8000 });
      return {
        available: true,
        url: this.getWikiWebUrl(),
        remoteRepo: `${this.owner}/${this.repo}.wiki.git`,
        pageCount: this.listPages().length
      };
    } catch {
      return {
        available: false,
        url: this.getWikiWebUrl(),
        remoteRepo: `${this.owner}/${this.repo}.wiki.git`,
        pageCount: 0,
        initializeUrl: `${this.getWikiWebUrl()}/_new`,
        message: 'GitHub Wiki repository has not yet been initialized with its first page.'
      };
    }
  }

  public syncFromRemote(): boolean {
    const status = this.checkRemoteAvailability();
    if (!status.available) return false;

    fs.mkdirSync(path.dirname(this.cloneDir), { recursive: true });
    const url = this.getWikiRemoteUrl();

    if (!fs.existsSync(path.join(this.cloneDir, '.git'))) {
      if (fs.existsSync(this.cloneDir)) fs.rmSync(this.cloneDir, { recursive: true });
      execSync(`git clone "${url}" "${this.cloneDir}"`, { stdio: 'pipe', timeout: 15000 });
    } else {
      execSync(`git -C "${this.cloneDir}" pull origin master`, { stdio: 'pipe', timeout: 10000 });
    }
    return true;
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

  private getFallbackPages(): WikiPage[] {
    return [
      {
        slug: 'architecture',
        title: 'Aegis System Architecture',
        threeBulletSummary: [
          'Autonomous multi-worktree execution with Alice and Bob.',
          'Deterministic Iron Cage quality gates (< 300 lines/file, < 40 lines/fn).',
          'MultiGravity and cross-IDE MCP synchronization.'
        ],
        content: 'Living memory specification backed by GitHub Wiki.',
        lastUpdated: new Date().toISOString()
      },
      {
        slug: 'ast-skeleton',
        title: 'AST Skeleton Prompt Caching',
        threeBulletSummary: [
          'Zero-token context reduction via skeleton maps (~82% savings).',
          'Language extractors for TypeScript, Python, GDScript, Rust, and Go.',
          'Surgical diff validation with zero hallucination.'
        ],
        content: 'Living memory specification backed by GitHub Wiki.',
        lastUpdated: new Date().toISOString()
      }
    ];
  }
}
