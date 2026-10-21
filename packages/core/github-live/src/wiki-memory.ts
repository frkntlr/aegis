import type { WikiPage } from './types.js';

export class WikiMemoryManager {
  private pages: Map<string, WikiPage> = new Map();

  public setPage(slug: string, title: string, threeBullets: [string, string, string], content = ''): void {
    this.pages.set(slug, {
      slug,
      title,
      threeBulletSummary: threeBullets,
      content,
      lastUpdated: new Date().toISOString()
    });
  }

  public getContextForLabels(labels: string[]): string {
    const relevantSlugs = labels
      .filter(l => l.startsWith('wiki:'))
      .map(l => l.replace('wiki:', '').trim());

    if (relevantSlugs.length === 0) {
      // If no specific wiki tags, return minimal general architecture bullets
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

  public recordMergeSummary(slug: string, title: string, threeBullets: [string, string, string]): void {
    this.setPage(slug, title, threeBullets);
  }
}
