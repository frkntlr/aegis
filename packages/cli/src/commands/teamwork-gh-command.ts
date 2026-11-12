/** CLI GitHub tracking with resumable, project-local remote links. */
import { TeamworkCoordinator } from '@aegis/orchestrator';
import { TeamworkGitHubSynchronizer } from '@aegis/github-live';
import { showBanner } from './banner.js';
import * as fs from 'node:fs';
import { loadTeamworkPlan, saveTeamworkPlan } from './teamwork-plan-store.js';
import { syncTeamworkPlanToGitHub } from './teamwork-github-sync.js';

function parseGitHubArgs(objective: string | undefined, args: string[]) {
  const all = objective?.startsWith('--') ? [objective, ...args] : args;
  const planId = all.find(arg => arg.startsWith('--plan='))?.slice('--plan='.length);
  const dryRun = all.includes('--dry-run');
  const scale = all.includes('--scale') || all.includes('-s');
  const files = all.filter(arg => arg && !arg.startsWith('-'));
  if (planId && files.length) throw new Error('Saved plan scope cannot be replaced with target files');
  return { objective: objective?.startsWith('--') ? undefined : objective?.trim(), planId, dryRun, scale, files };
}

export async function handleTeamworkGitHub(objectiveArg?: string, ...args: string[]): Promise<void> {
  showBanner();
  try {
    const parsed = parseGitHubArgs(objectiveArg, args);
    if (!parsed.objective && !parsed.planId) {
      throw new Error('Usage: aegis tw:gh "<objective>" [targetFiles...] [--dry-run], or aegis tw:gh --plan=<saved-plan-id>');
    }
    const coordinator = new TeamworkCoordinator({ bootstrap: false });
    const plan = parsed.planId ? loadTeamworkPlan(parsed.planId) : coordinator.planTeamwork(parsed.objective!, parsed.files, {
      stage: !parsed.dryRun, acquireLocks: !parsed.dryRun,
      autoScale: parsed.scale, maxConcurrency: parsed.scale ? 12 : undefined
    });
    console.log(`Teamwork mission: ${plan.planId}; objective: ${plan.objective}`);
    if (parsed.dryRun) { console.log('[DRY RUN] No GitHub publication or local task/link changes.'); return; }
    if (!parsed.planId) saveTeamworkPlan(plan);
    console.log(`Retry this saved plan with: aegis tw:gh --plan=${plan.planId}`);
    const links = await syncTeamworkPlanToGitHub(plan, new TeamworkGitHubSynchronizer());
    console.log(`GitHub Discussion: ${links.discussion!.url}`);
    for (const entry of links.entries) console.log(`${entry.trackId}: #${entry.issueNumber} ${entry.issueUrl}`);
    for (const failure of links.failures) console.error(`${failure.trackId}: ${failure.error}`);
    if (links.failures.length) { process.exitCode = 1; console.error(`Partial GitHub sync: ${links.entries.length} linked, ${links.failures.length} failed.`); }
    else console.log(`GitHub tracking linked for ${links.entries.length} tracks. Local inbox IDs remain separate.`);
  } catch (error) {
    process.exitCode = 1;
    console.error(`GitHub teamwork failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function handleTeamworkGitHubClose(
  commitHash?: string, summary?: string, issueNum?: number,
  proof?: Parameters<TeamworkGitHubSynchronizer['closeIssueWithProof']>[3]
): Promise<void> {
  showBanner();
  if (!commitHash || !summary?.trim() || !issueNum || !proof) {
    throw new Error('Closing requires a remote issue number, full commit hash, summary and passed verification check evidence');
  }
  await new TeamworkGitHubSynchronizer().closeIssueWithProof(issueNum, commitHash, summary, proof);
  console.log(`Closed GitHub issue #${issueNum} with supplied verification evidence for ${commitHash}.`);
}

export async function handleTeamworkGitHubCloseCommand(...args: string[]): Promise<void> {
  const [commit, summary, issue, proofFile] = args;
  if (args.length !== 4 || !/^\d+$/.test(issue ?? '') || !proofFile) {
    throw new Error('Usage: aegis tw:gh:close <full-commit-hash> "<summary>" <remote-issue-number> <proof.json>');
  }
  const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8').replace(/^\uFEFF/, '')) as
    Parameters<TeamworkGitHubSynchronizer['closeIssueWithProof']>[3];
  await handleTeamworkGitHubClose(commit, summary, Number(issue), proof);
}
