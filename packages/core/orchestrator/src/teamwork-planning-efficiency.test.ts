import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TeamworkCoordinator } from './teamwork-coordinator.js';
import { ProjectBootstrapEngine } from './project-bootstrap.js';

function fixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-plan-efficiency-'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('constructor and repeated staging bootstrap once while explicit bootstrap remains available', t => fixture(root => {
  const bootstrap = t.mock.method(ProjectBootstrapEngine, 'bootstrap');
  const coordinator = new TeamworkCoordinator(root);
  for (let i = 0; i < 2; i++) coordinator.planTeamwork('Implement feature', ['src/a.ts'], { acquireLocks: false });
  assert.equal(bootstrap.mock.callCount(), 1);
  coordinator.bootstrap({ force: true });
  assert.equal(bootstrap.mock.callCount(), 2);
}));

test('preview defers bootstrap and a failed bootstrap is retried during staging', t => fixture(root => {
  const original = ProjectBootstrapEngine.bootstrap;
  let attempts = 0;
  t.mock.method(ProjectBootstrapEngine, 'bootstrap', (...args: Parameters<typeof original>) => {
    if (++attempts === 1) throw new Error('Temporary IO failure');
    return original(...args);
  });
  const coordinator = new TeamworkCoordinator({ repoRoot: root, bootstrap: false });
  coordinator.planTeamwork('Implement feature', ['src/a.ts'], { stage: false });
  assert.equal(attempts, 0);
  for (let i = 0; i < 2; i++) coordinator.planTeamwork('Implement feature', ['src/a.ts'], { acquireLocks: false });
  assert.equal(attempts, 2);
}));

test('repeated plan staging allocates distinct numeric IDs and preserves unrelated inbox records', () => fixture(root => {
  const inbox = path.join(root, '.aegis/task-inbox.json');
  fs.mkdirSync(path.dirname(inbox), { recursive: true });
  const unrelated = { id: 900001, issueNumber: 900002, title: 'Existing task', status: 'done' };
  fs.writeFileSync(inbox, JSON.stringify([unrelated]));
  const coordinator = new TeamworkCoordinator({ repoRoot: root, bootstrap: false });
  for (let i = 0; i < 2; i++) coordinator.planTeamwork('Implement feature', ['src/a.ts'],
    { deterministic: true, acquireLocks: false });
  const records = JSON.parse(fs.readFileSync(inbox, 'utf8')) as Array<typeof unrelated>;
  assert.deepEqual(records[0], unrelated);
  const staged = records.slice(1);
  assert.ok(staged.length >= 2);
  assert.ok(staged.every(record => record.issueNumber > unrelated.issueNumber && record.id === record.issueNumber));
  assert.equal(new Set(staged.map(record => record.issueNumber)).size, staged.length);
}));
