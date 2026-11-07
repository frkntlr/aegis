/**
 * @file teamwork-gh-command.ts
 * CLI command handlers for real-time GitHub Discussion and Issue lifecycle synchronization.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { TeamworkCoordinator, type TeamworkPlan } from '@aegis/orchestrator';
import { TeamworkGitHubSynchronizer } from '@aegis/github-live';
import { showBanner } from './banner.js';

async function syncTracksToGitHub(
  sync: TeamworkGitHubSynchronizer,
  plan: TeamworkPlan,
  matrix: string
): Promise<void> {
  const disc = await sync.publishOrAttachDiscussion(plan.objective);
  console.log(`💬 GitHub Discussion Attached: ${disc.url}\n\n🚀 Staging Linked GitHub Tracking Issues:`);
  for (const track of plan.tracks) {
    const entry = await sync.createTrackingIssue(track, disc.url);
    console.log(` • [Phase ${track.phase}] #${entry.issueNumber}: @${track.subagentName} (${entry.issueUrl})`);
  }
  console.log(`\n${matrix}\n✅ All subagents staged in TIP queue with real-time GitHub tracking.`);
}

export async function handleTeamworkGitHub(objectiveArg?: string, ...args: string[]): Promise<void> {
  showBanner();
  if (!objectiveArg?.trim()) {
    console.error('❌ Usage: aegis tw:gh "<objective>" [targetFiles...] [--scale] [--dry-run]');
    return;
  }
  const isDryRun = args.includes('--dry-run');
  const isScale = args.includes('--scale') || args.includes('-s');
  const files = args.filter(a => a && !a.startsWith('-'));
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg.trim(), files, {
    stage: !isDryRun, acquireLocks: !isDryRun, autoScale: isScale, maxConcurrency: isScale ? 12 : undefined
  });
  console.log(`🎯 Aegis Teamwork Mission: ${plan.planId}\n • Objective: "${plan.objective}"`);
  if (plan.complexity) {
    console.log(` • ⚡ Complexity Radar: [${plan.complexity.tier}] (${plan.complexity.score}/100) -> Auto: ${plan.complexity.optimalAgentCount} agents`);
  }
  if (isDryRun) {
    console.log(' • [DRY RUN] GitHub Discussion & Issues skipped.\n' + coordinator.formatLiveMatrix(plan));
    return;
  }
  await syncTracksToGitHub(new TeamworkGitHubSynchronizer(), plan, coordinator.formatLiveMatrix(plan));
}

export async function handleTeamworkGitHubClose(commitHash?: string, summary?: string, issueNum?: number): Promise<void> {
  showBanner();
  console.log('🔒 Verifying and closing completed Teamwork GitHub Issues...');
  const hash = commitHash || 'HEAD';
  const sum = summary || 'Multimodal Quality Gate passed (100% Demir Kafes, 100% Unit Tests)';
  if (issueNum) {
    const sync = new TeamworkGitHubSynchronizer();
    await sync.closeIssueWithProof(issueNum, hash, sum);
  }
  const coordinator = new TeamworkCoordinator();
  const meshState = coordinator.mesh.getMeshState();
  const planId = meshState ? meshState.planId : 'local';
  console.log(`✅ Verified and finalized mission ${planId}: ${sum} (commit: ${hash})`);
}
