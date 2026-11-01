import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkCompactEngine } from './teamwork-compact.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

test('TeamworkCompactEngine compacts raw terminal output with RTK', () => {
  const engine = new TeamworkCompactEngine();
  const noisy = '\x1b[32mPASS\x1b[0m test 1\n\x1b[32mPASS\x1b[0m test 2\n\x1b[31mFAIL\x1b[0m test 3\nError: Boom\n    at node:internal/process:10:1\n';
  const res = engine.compactOutput(noisy);

  assert.ok(res.tokenSavingsPercent >= 0);
  assert.ok(res.compressedLines <= res.originalLines || res.compressedText.length > 0);
  assert.ok(!res.compressedText.includes('node:internal'));
});

test('TeamworkCompactEngine archives done tasks and compacts inbox', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-inbox-test-'));
  const aegisDir = path.join(tmpDir, '.aegis');
  fs.mkdirSync(aegisDir, { recursive: true });

  const inboxPath = path.join(aegisDir, 'task-inbox.json');
  const tasks = [
    { issueNumber: 101, title: 'Task 1', status: 'done' },
    { issueNumber: 102, title: 'Task 2', status: 'pending' },
    { issueNumber: 103, title: 'Task 3', status: 'done' }
  ];
  fs.writeFileSync(inboxPath, JSON.stringify(tasks, null, 2), 'utf8');

  try {
    const engine = new TeamworkCompactEngine(tmpDir);
    const res = engine.compactInbox();

    assert.strictEqual(res.archivedCount, 2);
    assert.strictEqual(res.remainingCount, 1);

    const remaining = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].issueNumber, 102);

    const ledger = JSON.parse(fs.readFileSync(res.ledgerPath, 'utf8'));
    assert.strictEqual(ledger.length, 2);
    assert.strictEqual(ledger[0].issueNumber, 101);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCompactEngine generates Antigravity-ready compact briefing', () => {
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork('Build compact module');
  const engine = coordinator.getCompactEngine();
  const briefing = engine.generateCompactBriefing(plan);

  assert.ok(briefing.includes('Antigravity Compact Mission Briefing'));
  assert.ok(briefing.includes('Build compact module'));
  assert.ok(briefing.includes('Demir Kafes'));
});

test('TeamworkCompactEngine compacts excessive grounding text', () => {
  const engine = new TeamworkCompactEngine();
  const longText = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join('\n');
  const compacted = engine.compactGroundingContext(longText, 20);

  assert.ok(compacted.split('\n').length <= 22);
  assert.ok(compacted.includes('Antigravity Compact'));
});

test('TeamworkCoordinator compactTeamwork delegates cleanly', () => {
  const coordinator = new TeamworkCoordinator();
  const briefing = coordinator.compactTeamwork();
  assert.ok(briefing.includes('Antigravity Compact Mission Briefing'));
  assert.ok(coordinator.getSemanticAnalyzer() !== undefined);
});
