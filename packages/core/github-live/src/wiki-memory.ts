import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WikiPage } from './types.js';

export class WikiMemoryManager {
  private pages: Map<string, WikiPage> = new Map();
  private baseDir?: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir;
    if (baseDir) {
      this.loadFromDisk(baseDir);
    }
  }

  public setPage(slug: string, title: string, threeBullets: [string, string, string], content = ''): void {
    const page: WikiPage = {
      slug,
      title,
      threeBulletSummary: threeBullets,
      content,
      lastUpdated: new Date().toISOString()
    };
    this.pages.set(slug, page);

    if (this.baseDir) {
      this.persistPage(page, this.baseDir);
    }
  }

  private persistPage(page: WikiPage, dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.resolve(dir, `${page.slug}.md`);
    const md = [
      `# ${page.title}`,
      '',
      '## Living Memory (Three Bullets)',
      `• ${page.threeBulletSummary[0]}`,
      `• ${page.threeBulletSummary[1]}`,
      `• ${page.threeBulletSummary[2]}`,
      '',
      '## Detailed Context',
      page.content || '_No additional detailed content recorded yet._',
      '',
      `_Last Updated: ${page.lastUpdated}_`
    ].join('\n');
    fs.writeFileSync(filePath, md, 'utf8');
  }

  public loadFromDisk(dir: string): void {
    this.baseDir = dir;
    if (!fs.existsSync(dir)) {
      this.seedDefaultPages(dir);
      return;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    if (files.length === 0) {
      this.seedDefaultPages(dir);
      return;
    }
    for (const f of files) {
      const slug = path.basename(f, '.md');
      const raw = fs.readFileSync(path.resolve(dir, f), 'utf8');
      this.parseAndSetPage(slug, raw);
    }
  }

  private parseAndSetPage(slug: string, raw: string): void {
    const lines = raw.split('\n');
    const title = lines[0]?.replace(/^#\s*/, '').trim() || slug;
    const bullets = lines.filter(l => l.trim().startsWith('• ')).map(l => l.replace(/^•\s*/, '').trim());
    const threeBullets: [string, string, string] = [
      bullets[0] || 'Core system principle preserved.',
      bullets[1] || 'Living architecture documentation updated.',
      bullets[2] || 'Demir Kafes compliance verified.'
    ];
    this.pages.set(slug, {
      slug,
      title,
      threeBulletSummary: threeBullets,
      content: raw,
      lastUpdated: new Date().toISOString()
    });
  }

  private seedDefaultPages(_dir: string): void {
    this.setPage(
      'architecture',
      'Aegis System Architecture',
      [
        'Autonomous multi-worktree execution with Alice and Bob.',
        'Deterministic Iron Cage quality gates (< 300 lines/file, < 40 lines/fn).',
        'MultiGravity and cross-IDE MCP synchronization.'
      ],
      'High-level architecture documentation for autonomous vibe coding engine.'
    );
    this.setPage(
      'ast-skeleton',
      'AST Skeleton Prompt Caching',
      [
        'Zero-token context reduction via skeleton maps (~82% savings).',
        'Language extractors for TypeScript, Python, GDScript, Rust, and Go.',
        'Surgical diff validation with zero hallucination.'
      ],
      'Detailed AST skeleton caching rules and multi-language routing.'
    );
  }

  public getContextForLabels(labels: string[]): string {
    const relevantSlugs = labels
      .filter(l => l.startsWith('wiki:'))
      .map(l => l.replace('wiki:', '').trim());

    if (relevantSlugs.length === 0) {
      const general = this.pages.get('architecture');
      return general
        ? `# Living Memory (General Architecture):\n${general.threeBulletSummary.map(b => `• ${b}`).join('\n')}`
        : '';
    }

    const summaries: string[] = [];
    for (const slug of relevantSlugs) {
      const page = this.pages.get(slug);
      if (page) {
        summaries.push(`## Module Memory [${page.title}]:\n${page.threeBulletSummary.map(b => `• ${b}`).join('\n')}`);
      }
    }
    return summaries.join('\n\n');
  }

  public listPages(): WikiPage[] {
    return Array.from(this.pages.values());
  }

  public getPage(slug: string): WikiPage | undefined {
    return this.pages.get(slug);
  }

  public exportAll(outputDir: string): string[] {
    fs.mkdirSync(outputDir, { recursive: true });
    const written: string[] = [];
    for (const page of this.pages.values()) {
      this.persistPage(page, outputDir);
      written.push(path.resolve(outputDir, `${page.slug}.md`));
    }
    return written;
  }

  public recordMergeSummary(slug: string, title: string, threeBullets: [string, string, string]): void {
    this.setPage(slug, title, threeBullets);
  }
}
