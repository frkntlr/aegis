import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveSafeRepoRoot } from '@aegis/shared';
import type { GitHubTrackingEntry } from '@aegis/github-live';

export interface GitHubPlanLinks {
  planId: string;
  repository?: string;
  discussion?: { url: string; number?: number };
  entries: GitHubTrackingEntry[];
  failures: Array<{ trackId: string; error: string }>;
}

function linksPath(planId: string): string {
  if (!/^tw-[a-zA-Z0-9_-]+$/.test(planId)) throw new Error('Invalid teamwork plan ID');
  return path.join(resolveSafeRepoRoot(), '.aegis/teamwork-github', `${planId}.json`);
}

function validateLinks(links: GitHubPlanLinks): void {
  if (links.repository && !/^[^/\s]+\/[^/\s]+$/.test(links.repository)) throw new Error('Invalid saved repository identity');
  const seen = new Set<string>();
  for (const entry of links.entries) {
    if (!entry || typeof entry.trackId !== 'string' || !entry.trackId || seen.has(entry.trackId) ||
        !Number.isSafeInteger(entry.issueNumber) || entry.issueNumber <= 0 ||
        typeof entry.issueUrl !== 'string' || entry.issueUrl.toLowerCase() !== `https://github.com/${links.repository}/issues/${entry.issueNumber}`.toLowerCase() ||
        !['open', 'closed'].includes(entry.status)) throw new Error('Invalid saved GitHub issue link; reconcile before retrying');
    seen.add(entry.trackId);
  }
  const discussionPrefix = `https://github.com/${links.repository}/discussions/`;
  if (links.discussion && (!links.repository || typeof links.discussion.url !== 'string' ||
      !links.discussion.url.toLowerCase().startsWith(discussionPrefix.toLowerCase()) ||
      !/^[1-9]\d*$/.test(links.discussion.url.slice(discussionPrefix.length)))) {
    throw new Error('Invalid saved GitHub discussion link; reconcile before retrying');
  }
}

export function readGitHubPlanLinks(planId: string): GitHubPlanLinks {
  const file = linksPath(planId);
  if (!fs.existsSync(file)) return { planId, entries: [], failures: [] };
  const links = JSON.parse(fs.readFileSync(file, 'utf8')) as GitHubPlanLinks;
  if (links.planId !== planId || !Array.isArray(links.entries) || !Array.isArray(links.failures)) {
    throw new Error('Invalid saved GitHub links; recover the record before retrying');
  }
  validateLinks(links);
  const ids = links.entries.map(entry => entry?.trackId);
  if (new Set(ids).size !== ids.length || links.entries.some(entry => !entry?.trackId ||
    !Number.isSafeInteger(entry.issueNumber) || entry.issueNumber <= 0 || !/^https:\/\//.test(entry.issueUrl))) {
    throw new Error('Invalid saved GitHub issue identities; recover the record before retrying');
  }
  return links;
}

export function saveGitHubPlanLinks(links: GitHubPlanLinks): void {
  validateLinks(links);
  const file = linksPath(links.planId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(links, null, 2), 'utf8');
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

/** Fail immediately instead of blocking the event loop while another sync awaits GitHub. */
export function lockGitHubPlanLinks(planId: string): () => void {
  const lock = `${linksPath(planId)}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let descriptor: number;
  try { descriptor = fs.openSync(lock, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error(`GitHub sync already locked for ${planId}; reconcile an interrupted sync before retrying`);
  }
  fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  return () => { fs.closeSync(descriptor); fs.unlinkSync(lock); };
}
