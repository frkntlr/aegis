import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildCodexInvocation } from './codex-teamwork.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

const track = {
  id: 'solver-uyumlu-123', title: 'Review Codex compatibility', targetFiles: [],
  dependsOn: ['setup-123'], phase: 2, roleType: 'solver' as const
};

test('unscoped Codex dispatch remains read-only and cannot claim arbitrary inbox work', () => {
  const payload = buildCodexInvocation(track, 'Check remaining compatibility');
  assert.match(payload.message, /Assigned files: read-only; do not edit project files/);
  assert.match(payload.message, /exact numeric inbox task ID confirmed for this track/);
  assert.match(payload.message, /do not pull arbitrary same-role tasks/);
  assert.match(payload.message, /explicit scope expansion before editing other files/);
  assert.doesNotMatch(payload.message, /inspect scope before editing/);
});

test('scoped Codex dispatch keeps dependencies, grounding and project-local state rules', () => {
  const payload = buildCodexInvocation({ ...track, targetFiles: ['src/a.ts'] },
    'Fix Codex support', 'Grounded symbol: example');
  assert.match(payload.message, /Assigned files: src\/a.ts/);
  assert.match(payload.message, /dependencies: setup-123/);
  assert.match(payload.message, /Grounded symbol: example/);
  assert.match(payload.message, /active project directory unless the connected MCP project root is confirmed to match/);
  assert.match(payload.message, /external publication within explicit user authorization/);
  assert.equal(payload.fork_turns, 'all');
  assert.match(payload.task_name, /^[a-z0-9_]+$/);
  assert.doesNotMatch(payload.message, /invoke_subagent|define_subagent|Model: flash/);
});

test('decomposed Codex tracks retain the complete Turkish mission without changing legacy prompts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-codex-mission-'));
  const objective = 'şimdi geri kalan codex ile uyumlu olmayan özellikleri codexe uygun hale getir';
  try {
    const plan = new TeamworkCoordinator(root).planTeamwork(objective, ['src/cli.ts', 'src/core.ts'],
      { stage: false, acquireLocks: false, deterministic: true });
    assert.ok(plan.tracks.length > 1);
    for (const item of plan.tracks) {
      const payload = item.codexInvocationPayload;
      assert.ok(payload);
      assert.ok(payload.message.startsWith(`Mission: ${objective}\n`));
      assert.ok(payload.message.includes('Objective: '));
      assert.equal(item.invocationPayload.Prompt, item.prompt);
      assert.ok(!item.invocationPayload.Prompt.startsWith('Mission: '));
    }
    assert.ok(plan.tracks.some(item => !item.codexInvocationPayload?.message.includes(`Objective: ${objective}\n`)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
