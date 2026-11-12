import type { TeamworkPlan } from '@aegis/orchestrator';
import type { TeamworkGitHubSynchronizer } from '@aegis/github-live';
import { lockGitHubPlanLinks, readGitHubPlanLinks, saveGitHubPlanLinks, type GitHubPlanLinks } from './teamwork-github-store.js';

type SyncClient = Pick<TeamworkGitHubSynchronizer, 'publishOrAttachDiscussion' | 'createTrackingIssue' | 'repository'>;

function bindRepository(links: GitHubPlanLinks, repository: string | undefined): void {
  if (!repository?.trim()) throw new Error('GitHub repository identity is required before syncing links');
  if ((links.discussion || links.entries.length) && !links.repository) throw new Error('Saved GitHub links lack repository identity; reconcile before retrying');
  if (links.repository && links.repository.toLowerCase() !== repository.toLowerCase()) {
    throw new Error(`Saved GitHub links target ${links.repository}; current repository is ${repository}`);
  }
  links.repository = repository;
}

/** Persist each confirmed issue before advancing so a partial retry reuses successful links. */
export async function syncTeamworkPlanToGitHub(plan: TeamworkPlan, sync: SyncClient): Promise<GitHubPlanLinks> {
  const unlock = lockGitHubPlanLinks(plan.planId);
  try {
    const links = readGitHubPlanLinks(plan.planId);
    bindRepository(links, sync.repository);
    if (!links.discussion) {
      links.discussion = await sync.publishOrAttachDiscussion(plan.objective);
      saveGitHubPlanLinks(links);
    }
    const pending = plan.tracks.filter(track => !links.entries.some(entry => entry.trackId === track.id));
    links.failures = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const track = pending[cursor++];
        try {
          const entry = await sync.createTrackingIssue(track, links.discussion!.url);
          if (entry.trackId !== track.id || !Number.isSafeInteger(entry.issueNumber) || entry.issueNumber <= 0 || !entry.issueUrl) {
            throw new Error('GitHub returned an invalid tracking issue');
          }
          links.entries.push(entry);
        } catch (error) {
          links.failures.push({ trackId: track.id, error: error instanceof Error ? error.message : String(error) });
        }
        saveGitHubPlanLinks(links);
      }
    };
    const results = await Promise.allSettled(Array.from({ length: Math.min(3, pending.length) }, worker));
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    saveGitHubPlanLinks(links);
    return links;
  } finally { unlock(); }
}
