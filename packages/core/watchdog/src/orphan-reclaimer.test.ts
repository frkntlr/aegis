import { test } from 'node:test';
import * as assert from 'node:assert';
import { OrphanTaskReclaimer, type ReclaimCandidate, type AgentSessionSummary } from './orphan-reclaimer.js';

test('OrphanTaskReclaimer leaves active locked tasks untouched', () => {
  const reclaimer = new OrphanTaskReclaimer({ staleTimeoutMs: 60_000 });
  const issues: ReclaimCandidate[] = [
    {
      id: 1,
      number: 1,
      title: 'Active Task',
      status: 'in_progress',
      assignedAgent: 'solver',
      targetFiles: ['src/core.ts']
    }
  ];
  const locks = new Map<string, string>([['src/core.ts', 'solver']]);
  const sessions: AgentSessionSummary[] = [
    { agentName: 'solver', lastHeartbeat: new Date().toISOString(), status: 'active' }
  ];

  const result = reclaimer.scanAndReclaim(issues, locks, sessions);
  assert.strictEqual(result.reclaimed.length, 0);
  assert.strictEqual(result.updatedIssues[0].status, 'in_progress');
  assert.strictEqual(result.updatedIssues[0].assignedAgent, 'solver');
});

test('OrphanTaskReclaimer reclaims tasks with no assigned agent (ghost tasks)', () => {
  const reclaimer = new OrphanTaskReclaimer();
  const issues: ReclaimCandidate[] = [
    {
      id: 2,
      number: 2,
      title: 'Unassigned in-progress task',
      status: 'in_progress',
      targetFiles: ['src/unassigned.ts']
    }
  ];

  const result = reclaimer.scanAndReclaim(issues);
  assert.strictEqual(result.reclaimed.length, 1);
  assert.strictEqual(result.reclaimed[0].issueNumber, 2);
  assert.ok(result.reclaimed[0].reason.includes('Ghost task'));
  assert.strictEqual(result.updatedIssues[0].status, 'ready');
  assert.strictEqual(result.updatedIssues[0].assignedAgent, undefined);
});

test('OrphanTaskReclaimer reclaims tasks where agent holds zero file locks', () => {
  const reclaimer = new OrphanTaskReclaimer();
  const issues: ReclaimCandidate[] = [
    {
      id: 3,
      number: 3,
      title: 'Lock Disconnected Task',
      status: 'in_progress',
      assignedAgent: 'solver',
      targetFiles: ['src/target.ts']
    }
  ];
  const locks = new Map<string, string>(); // empty locks
  const sessions: AgentSessionSummary[] = [{ agentName: 'solver', lastHeartbeat: new Date().toISOString() }];

  const result = reclaimer.scanAndReclaim(issues, locks, sessions);
  assert.strictEqual(result.reclaimed.length, 1);
  assert.strictEqual(result.reclaimed[0].issueNumber, 3);
  assert.ok(result.reclaimed[0].reason.includes('zero active file locks'));
  assert.strictEqual(result.updatedIssues[0].status, 'ready');
});

test('OrphanTaskReclaimer reclaims tasks when agent heartbeat has expired', () => {
  const reclaimer = new OrphanTaskReclaimer({ staleTimeoutMs: 5000 });
  const staleTime = new Date(Date.now() - 10000).toISOString();
  const issues: ReclaimCandidate[] = [
    {
      id: 4,
      number: 4,
      title: 'Stalled Agent Task',
      status: 'in_progress',
      assignedAgent: 'solver',
      targetFiles: ['src/file.ts']
    }
  ];
  const locks = new Map<string, string>([['src/file.ts', 'solver']]);
  const sessions: AgentSessionSummary[] = [{ agentName: 'solver', lastHeartbeat: staleTime }];

  const result = reclaimer.scanAndReclaim(issues, locks, sessions);
  assert.strictEqual(result.reclaimed.length, 1);
  assert.strictEqual(result.reclaimed[0].issueNumber, 4);
  assert.ok(result.reclaimed[0].reason.includes('heartbeat expired'));
  assert.strictEqual(result.updatedIssues[0].status, 'ready');
});
