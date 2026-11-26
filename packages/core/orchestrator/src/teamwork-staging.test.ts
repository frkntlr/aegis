import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readJsonSafe } from '@aegis/shared';
import { stageTracksIntoInboxHelper } from './teamwork-staging.js';
import type { TeamworkTrack } from './teamwork-types.js';
import { WorktreeManager } from './worktree-manager.js';

function makeTrack(id: string, subagentName: string): TeamworkTrack {
  return {
    id,
    title: `Track ${id}`,
    roleType: 'solver',
    subagentName,
    prompt: `Do ${id}`,
    targetFiles: [],
    dependsOn: [],
    phase: 1,
    invocationPayload: {
      TypeName: subagentName,
      Role: 'issue-solver',
      Prompt: `Do ${id}`,
      Workspace: 'inherit',
      Model: 'inherit'
    }
  };
}

test('stageTracksIntoInboxHelper prevents duplicate IDs and updates existing trackId in place', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-staging-dedup-'));
  try {
    const aegisDir = path.join(tmpDir, '.aegis');
    fs.mkdirSync(aegisDir, { recursive: true });
    fs.writeFileSync(
      path.join(aegisDir, 'task-inbox.json'),
      JSON.stringify([
        { id: 10, issueNumber: 10, title: 'Existing 10', status: 'pending' },
        { id: 12, issueNumber: 12, title: 'Existing 12', status: 'pending' }
      ]),
      'utf8'
    );

    const wt = new WorktreeManager({ repoRoot: tmpDir, persistLocks: false });
    stageTracksIntoInboxHelper(tmpDir, 'tw-10', 'First objective', [makeTrack('t-1', 'solver-1'), makeTrack('t-2', 'solver-2')], wt, false);
    stageTracksIntoInboxHelper(tmpDir, 'tw-10', 'Updated objective', [makeTrack('t-1', 'solver-1'), makeTrack('t-3', 'solver-3')], wt, false);

    const inbox = readJsonSafe<Array<{ id: number; issueNumber: number; trackId?: string; acceptanceCriteria?: string[] }>>(
      path.join(aegisDir, 'task-inbox.json')
    );
    assert.strictEqual(inbox.length, 5);
    const ids = inbox.map(x => x.id);
    const issueNums = inbox.map(x => x.issueNumber);
    assert.strictEqual(new Set(ids).size, 5);
    assert.strictEqual(new Set(issueNums).size, 5);
    const t1 = inbox.find(x => x.trackId === 't-1');
    assert.ok(t1?.acceptanceCriteria?.[0].includes('Updated objective'));
    assert.strictEqual(fs.readdirSync(aegisDir).filter(f => f.includes('.tmp.')).length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
