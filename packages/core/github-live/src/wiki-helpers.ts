import type { WikiPage } from './types.js';

export function cleanGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  delete env.GIT_PREFIX;
  delete env.GIT_COMMON_DIR;
  return env;
}

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
