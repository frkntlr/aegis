import test, { beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TeamworkGitHubSynchronizer, GitHubTokenResolver } from '@aegis/github-live';
import { TeamworkTrackBuilder, getSubagentProfiles, type TeamworkPlan } from '@aegis/orchestrator';
import { handleTeamworkGitHub, handleTeamworkGitHubClose, handleTeamworkGitHubCloseCommand } from './teamwork-gh-command.js';
import { syncTeamworkPlanToGitHub } from './teamwork-github-sync.js';
import { readGitHubPlanLinks, lockGitHubPlanLinks } from './teamwork-github-store.js';
import { saveTeamworkPlan } from './teamwork-plan-store.js';

let workspace: string;
let previous: { workspace?: string; inbox?: string; exitCode: typeof process.exitCode };
beforeEach(() => {
  previous = { workspace: process.env.AEGIS_WORKSPACE, inbox: process.env.AEGIS_INBOX_PATH, exitCode: process.exitCode };
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-teamwork-gh-test-'));
  process.env.AEGIS_WORKSPACE = workspace;
  process.env.AEGIS_INBOX_PATH = path.join(workspace, '.aegis/task-inbox.json');
});
afterEach(() => {
  for (const [key, value] of Object.entries({ AEGIS_WORKSPACE: previous.workspace, AEGIS_INBOX_PATH: previous.inbox })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  process.exitCode = previous.exitCode;
  fs.rmSync(workspace, { recursive: true, force: true });
});

function plan(count = 3): TeamworkPlan {
  const profile = getSubagentProfiles()[0];
  return { planId: 'tw-github-fixture', objective: 'Track verified teamwork', createdAt: '', summary: '',
    tracks: Array.from({ length: count }, (_, i) => TeamworkTrackBuilder.buildTrack('solver', profile,
      `Implement ${i}`, [`src/${i}.ts`], `Scope${i}`, true)) };
}

function tracking(track: { id: string }, issueNumber: number) {
  return { trackId: track.id, issueNumber, issueUrl: `https://github.com/org/repo/issues/${issueNumber}`, status: 'open' as const };
}

test('GitHub dry-run leaves a fresh workspace empty and never calls remote methods', async t => {
  t.mock.method(TeamworkGitHubSynchronizer.prototype, 'publishOrAttachDiscussion', () => { throw new Error('unexpected remote request'); });
  await handleTeamworkGitHub('Build profile', 'src/profile.ts', '--dry-run');
  assert.deepEqual(fs.readdirSync(workspace), []);
  assert.equal(process.exitCode, previous.exitCode);
});

test('partial issue sync persists real remote links and retries only failed tracks', async () => {
  const mission = plan();
  let discussionCalls = 0;
  const created: string[] = [];
  let fail = true;
  const client = {
    repository: 'org/repo',
    publishOrAttachDiscussion: async () => { discussionCalls++; return { url: 'https://github.com/org/repo/discussions/7' }; },
    createTrackingIssue: async (track: { id: string }) => {
      created.push(track.id);
      if (track.id === mission.tracks[1].id && fail) throw new Error('GitHub rate limit');
      return tracking(track, 400 + mission.tracks.findIndex(item => item.id === track.id));
    }
  };
  const first = await syncTeamworkPlanToGitHub(mission, client);
  assert.equal(first.entries.length, 2);
  assert.deepEqual(first.failures, [{ trackId: mission.tracks[1].id, error: 'GitHub rate limit' }]);
  fail = false;
  const second = await syncTeamworkPlanToGitHub(mission, client);
  assert.equal(second.entries.length, 3);
  assert.equal(second.failures.length, 0);
  assert.equal(discussionCalls, 1);
  assert.equal(created.length, 4);
  assert.deepEqual(readGitHubPlanLinks(mission.planId), second);
  assert.ok(!fs.existsSync(path.join(workspace, '.aegis/task-inbox.json')));
});

test('issue creation uses at most three concurrent requests', async () => {
  let active = 0; let peak = 0;
  await syncTeamworkPlanToGitHub(plan(8), {
    repository: 'org/repo',
    publishOrAttachDiscussion: async () => ({ url: 'https://github.com/org/repo/discussions/8' }),
    createTrackingIssue: async track => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      active--;
      return tracking(track, Number(track.targetFiles[0].match(/\d+/)![0]) + 100);
    }
  });
  assert.equal(peak, 3);
});

test('saved plan retry preserves local numeric inbox IDs and reports partial failure', async t => {
  const mission = plan(2);
  saveTeamworkPlan(mission);
  const inbox = path.join(workspace, '.aegis/task-inbox.json');
  fs.writeFileSync(inbox, JSON.stringify([{ id: 15, issueNumber: 15, trackId: mission.tracks[0].id }]));
  const before = fs.readFileSync(inbox, 'utf8');
  t.mock.method(GitHubTokenResolver, 'resolve', () => ({ owner: 'org', repo: 'repo', token: 'mock', hasCredentials: true, source: 'env' as const }));
  t.mock.method(TeamworkGitHubSynchronizer.prototype, 'publishOrAttachDiscussion', async () => ({ url: 'https://github.com/org/repo/discussions/9' }));
  t.mock.method(TeamworkGitHubSynchronizer.prototype, 'createTrackingIssue', async (track: TeamworkPlan['tracks'][number]) => {
    if (track.id === mission.tracks[1].id) throw new Error('Access denied');
    return tracking(track, 900);
  });
  const errors: string[] = [];
  t.mock.method(console, 'error', (line: string) => errors.push(line));
  await handleTeamworkGitHub(`--plan=${mission.planId}`);
  assert.equal(fs.readFileSync(inbox, 'utf8'), before);
  assert.equal(readGitHubPlanLinks(mission.planId).entries[0].issueNumber, 900);
  assert.match(errors.join('\n'), /Partial GitHub sync: 1 linked, 1 failed/);
  assert.equal(process.exitCode, 1);
});

test('discussion failures and active sync locks fail explicitly without fabricated links', async () => {
  const mission = plan();
  await assert.rejects(syncTeamworkPlanToGitHub(mission, {
    repository: 'org/repo',
    publishOrAttachDiscussion: async () => { throw new Error('Discussions disabled'); },
    createTrackingIssue: async () => { throw new Error('must not create issues'); }
  }), /Discussions disabled/);
  assert.deepEqual(readGitHubPlanLinks(mission.planId).entries, []);
  const unlock = lockGitHubPlanLinks(mission.planId);
  try {
    await assert.rejects(syncTeamworkPlanToGitHub(mission, {} as TeamworkGitHubSynchronizer), /already locked/);
  } finally { unlock(); }
});

test('close requires explicit remote issue and check evidence and reports remote failure', async t => {
  await assert.rejects(handleTeamworkGitHubClose(), /requires a remote issue number/);
  await assert.rejects(handleTeamworkGitHubClose('a'.repeat(40), 'tests passed', 42), /verification check evidence/);
  const proof = { checks: [{ command: 'npm test', outcome: 'passed' as const, evidence: '12 tests passed' }] };
  t.mock.method(TeamworkGitHubSynchronizer.prototype, 'closeIssueWithProof', async () => { throw new Error('GitHub close denied'); });
  await assert.rejects(handleTeamworkGitHubClose('a'.repeat(40), 'Focused suite passed', 42, proof), /GitHub close denied/);
});

test('retry refuses a different configured repository before making remote requests', async () => {
  const mission = plan(1);
  const client = { repository: 'org/repo',
    publishOrAttachDiscussion: async () => ({ url: 'https://github.com/org/repo/discussions/3' }),
    createTrackingIssue: async (track: { id: string }) => tracking(track, 75) };
  await syncTeamworkPlanToGitHub(mission, client);
  await assert.rejects(syncTeamworkPlanToGitHub(mission, { ...client, repository: 'other/repo',
    publishOrAttachDiscussion: async () => { throw new Error('must not call remote'); }
  }), /Saved GitHub links target org\/repo; current repository is other\/repo/);
});

test('close CLI wrapper passes only explicitly supplied proof and remote issue number', async t => {
  const proof = { checks: [{ command: 'npm test', outcome: 'passed', evidence: '12 tests passed' }] };
  const file = path.join(workspace, 'proof.json');
  fs.writeFileSync(file, JSON.stringify(proof));
  let actual: unknown[] = [];
  t.mock.method(TeamworkGitHubSynchronizer.prototype, 'closeIssueWithProof', async (...args: unknown[]) => { actual = args; });
  await handleTeamworkGitHubCloseCommand('a'.repeat(40), 'Focused tests passed', '82', file);
  assert.deepEqual(actual, [82, 'a'.repeat(40), 'Focused tests passed', proof]);
  await assert.rejects(handleTeamworkGitHubCloseCommand('HEAD', 'No proof'), /Usage:/);
});

test('corrupt saved issue links cannot masquerade as completed synchronization', async () => {
  const mission = plan(1);
  const file = path.join(workspace, '.aegis/teamwork-github', `${mission.planId}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ planId: mission.planId, repository: 'org/repo',
    discussion: { url: 'https://github.com/org/repo/discussions/3' }, failures: [],
    entries: [{ trackId: mission.tracks[0].id, status: 'open' }] }));
  await assert.rejects(syncTeamworkPlanToGitHub(mission, { repository: 'org/repo',
    publishOrAttachDiscussion: async () => { throw new Error('must not call remote'); },
    createTrackingIssue: async () => { throw new Error('must not call remote'); }
  }), /Invalid saved GitHub issue link/);
});
