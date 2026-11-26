import * as path from 'node:path';
import { cleanGitEnv } from '@aegis/shared';
import type { WikiPage } from './types.js';

export { cleanGitEnv };

export function buildGitAuthEnv(token?: string, baseEnv: NodeJS.ProcessEnv = cleanGitEnv()): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  const cleanToken = token?.trim();
  if (!cleanToken) return env;
  const rawCount = Number.parseInt(env.GIT_CONFIG_COUNT || '0', 10);
  const idx = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 0;
  const encoded = Buffer.from(`x-access-token:${cleanToken}`, 'utf8').toString('base64');
  env.GIT_CONFIG_COUNT = String(idx + 1);
  env[`GIT_CONFIG_KEY_${idx}`] = 'http.https://github.com/.extraheader';
  env[`GIT_CONFIG_VALUE_${idx}`] = `AUTHORIZATION: basic ${encoded}`;
  return env;
}

export function redactGitToken(message: string, token?: string): string {
  let redacted = message
    .replace(/x-access-token:[^@\s]+@/gi, 'x-access-token:***@')
    .replace(/(https?:\/\/)([^/\s@:]+):([^@\s]+)@/gi, '$1$2:***@')
    .replace(/(AUTHORIZATION:\s*basic\s+)[A-Za-z0-9+/=]+/gi, '$1***');
  const cleanToken = token?.trim();
  if (cleanToken) {
    redacted = redacted.split(cleanToken).join('***');
  }
  return redacted;
}

export function isPathInsideDir(baseDir: string, targetPath: string): boolean {
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
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
    `_Cached locally on: ${dateStr}_`
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
      bullets[2] || 'Quality-gate evidence not supplied.'
    ],
    content: raw,
    lastUpdated: new Date().toISOString()
  };
}
