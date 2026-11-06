import { test } from 'node:test';
import * as assert from 'node:assert';
import { computeExecutionWaves, formatParallelDispatchBriefing, formatCompactWaveBriefing, getConcurrentExecutionBatches } from './teamwork-waves.js';
import type { TeamworkTrack } from './teamwork-types.js';

function createSampleTracks(): TeamworkTrack[] {
  return [
    {
      id: 'track-1',
      roleType: 'solver',
      subagentName: 'issue-solver [Core]',
      title: 'Parser Implementation',
      targetFiles: ['src/parser.ts'],
      prompt: 'p1',
      invocationPayload: { TypeName: 'issue-solver', Role: 'Core', Prompt: 'p1', Workspace: 'inherit', Model: 'flash' },
      dependsOn: [],
      phase: 1
    },
    {
      id: 'track-2',
      roleType: 'ui',
      subagentName: 'ui-specialist [UI]',
      title: 'HUD Implementation',
      targetFiles: ['res://hud.tscn'],
      prompt: 'p2',
      invocationPayload: { TypeName: 'ui-specialist', Role: 'UI', Prompt: 'p2', Workspace: 'inherit', Model: 'flash' },
      dependsOn: [],
      phase: 1
    },
    {
      id: 'track-3',
      roleType: 'qa',
      subagentName: 'qa-hunter [Audit]',
      title: 'QA Gate',
      targetFiles: ['test/parser.test.ts'],
      prompt: 'p3',
      invocationPayload: { TypeName: 'qa-hunter', Role: 'Audit', Prompt: 'p3', Workspace: 'inherit', Model: 'flash' },
      dependsOn: ['track-1', 'track-2'],
      phase: 2
    }
  ];
}

test('computeExecutionWaves groups tracks by phase into parallel execution waves', () => {
  const waves = computeExecutionWaves(createSampleTracks());
  assert.strictEqual(waves.length, 2);

  const wave1 = waves[0];
  assert.strictEqual(wave1.waveNumber, 1);
  assert.strictEqual(wave1.tracks.length, 2);
  assert.strictEqual(wave1.canRunConcurrently, true);
  assert.deepStrictEqual(wave1.requiredPriorWaves, []);

  const wave2 = waves[1];
  assert.strictEqual(wave2.waveNumber, 2);
  assert.strictEqual(wave2.tracks.length, 1);
  assert.strictEqual(wave2.canRunConcurrently, false);
  assert.deepStrictEqual(wave2.requiredPriorWaves, [1]);
});

test('computeExecutionWaves returns empty array for empty tracks', () => {
  assert.deepStrictEqual(computeExecutionWaves([]), []);
});

test('formatParallelDispatchBriefing produces structured parallel invoke instructions', () => {
  const tracks: TeamworkTrack[] = [
    {
      id: 't1',
      roleType: 'solver',
      subagentName: 'issue-solver [Parser]',
      title: 'Parser',
      targetFiles: ['parser.ts'],
      prompt: 'p',
      invocationPayload: { TypeName: 'issue-solver', Role: 'Parser', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
      dependsOn: [],
      phase: 1
    }
  ];
  const waves = computeExecutionWaves(tracks);
  const briefing = formatParallelDispatchBriefing(waves);

  assert.ok(briefing.includes('PARALLEL WAVES DISPATCH BRIEFING'));
  assert.ok(briefing.includes('WAVE 1'));
  assert.ok(briefing.includes('@issue-solver [Parser]'));
  assert.ok(briefing.includes('TypeName: "issue-solver"'));
});

test('formatCompactWaveBriefing produces dense single-line representation', () => {
  const waves = computeExecutionWaves(createSampleTracks());
  const compact = formatCompactWaveBriefing(waves);

  assert.ok(compact.includes('[PARALLEL WAVES:2]'));
  assert.ok(compact.includes('W1(PARALLEL): @issue-solver [Core]'));
  assert.ok(compact.includes('W2(SEQ): @qa-hunter [Audit]'));
});

test('getConcurrentExecutionBatches groups tracks into sequential parallel batches', () => {
  const batches = getConcurrentExecutionBatches(createSampleTracks());
  assert.strictEqual(batches.length, 2);
  assert.strictEqual(batches[0].length, 2);
  assert.strictEqual(batches[1].length, 1);
});


