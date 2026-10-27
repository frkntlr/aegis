import { GitHubWikiLiveAdapter } from './wiki-adapter.js';
import type { WikiFastSyncResult, WikiPage, WikiSyncOptions, WikiSyncStatus } from './types.js';

export class WikiMemoryManager {
  private adapter: GitHubWikiLiveAdapter;
  private pages: Map<string, WikiPage> = new Map();

  constructor(cloneDir?: string) {
    this.adapter = new GitHubWikiLiveAdapter({ localCloneDir: cloneDir });
    this.refreshPages();
  }

  public refreshPages(): void {
    const list = this.adapter.listPages();
    this.pages.clear();
    for (const p of list) {
      this.pages.set(p.slug, p);
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
    this.adapter.publishPage(slug, title, threeBullets, content);
  }

  public getContextForLabels(labels: string[]): string {
    const relevantSlugs = labels
      .filter(l => l.startsWith('wiki:'))
      .map(l => l.replace('wiki:', '').trim());

    if (relevantSlugs.length === 0) {
      const general = this.pages.get('architecture');
      return general
        ? `# Living Memory (GitHub Wiki Architecture):\n${general.threeBulletSummary.map(b => `• ${b}`).join('\n')}`
        : '';
    }

    const summaries: string[] = [];
    for (const slug of relevantSlugs) {
      const page = this.pages.get(slug);
      if (page) {
        summaries.push(`## GitHub Wiki Memory [${page.title}]:\n${page.threeBulletSummary.map(b => `• ${b}`).join('\n')}`);
      }
    }
    return summaries.join('\n\n');
  }

  public listPages(): WikiPage[] {
    return Array.from(this.pages.values());
  }

  public getPage(slug: string): WikiPage | undefined {
    return this.pages.get(slug) || this.adapter.getPage(slug);
  }

  public checkStatus(): WikiSyncStatus {
    return this.adapter.checkRemoteAvailability();
  }

  public fastSync(options?: WikiSyncOptions): WikiFastSyncResult {
    const res = this.adapter.fastSync(options);
    this.refreshPages();
    return res;
  }

  public syncLive(): boolean {
    const res = this.adapter.syncFromRemote();
    this.refreshPages();
    return res;
  }

  public recordMergeSummary(slug: string, title: string, threeBullets: [string, string, string]): void {
    this.setPage(slug, title, threeBullets);
  }

  public seedSuite(): { created: number; pages: string[] } {
    const res = this.adapter.seedComprehensiveWikiSuite();
    this.refreshPages();
    return res;
  }

  public pushAllToRemote(): { success: boolean; message: string } {
    return this.adapter.pushAllToRemote();
  }
}
