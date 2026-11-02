import { cleanGitEnv } from '@aegis/shared';
import type { WikiPage } from './types.js';

export { cleanGitEnv };

export function formatWikiMarkdown(
  title: string,
  bullets: [string, string, string],
  content: string,
  dateStr = new Date().toISOString()
): string {
  return [
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
    `_Published to GitHub Wiki on: ${dateStr}_`
  ].join('\n');
}

export function parseWikiMarkdown(slug: string, raw: string): WikiPage {
  const lines = raw.split('\n');
  const title = lines[0]?.replace(/^#\s*/, '').trim() || slug;
  const bullets = lines
    .filter(l => l.trim().startsWith('• '))
    .map(l => l.replace(/^•\s*/, '').trim());

  return {
    slug,
    title,
    threeBulletSummary: [
      bullets[0] || 'Living architecture documentation updated.',
      bullets[1] || 'Living architecture documentation updated.',
      bullets[2] || 'Demir Kafes compliance verified.'
    ],
    content: raw,
    lastUpdated: new Date().toISOString()
  };
}
