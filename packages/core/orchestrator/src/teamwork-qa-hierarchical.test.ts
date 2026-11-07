import { test } from 'node:test';
import * as assert from 'node:assert';
import { QA_SYSTEM_PROMPT, compileTrackPrompt, getSubagentProfiles } from './teamwork-prompts.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';

test('QA_SYSTEM_PROMPT embeds Hierarchical Recursive Execution protocol', () => {
  assert.ok(QA_SYSTEM_PROMPT.includes('Hierarchical Recursive Execution'));
  assert.ok(QA_SYSTEM_PROMPT.includes('invoke_subagent'));
  assert.ok(QA_SYSTEM_PROMPT.includes('child QA subagents'));
  assert.ok(QA_SYSTEM_PROMPT.includes('verify:task'));
});

test('compileTrackPrompt includes Hierarchical Subagents and Dynamic Mesh guidance in footer', () => {
  const profiles = getSubagentProfiles();
  const qaProfile = profiles.find(p => p.roleType === 'qa')!;
  const prompt = compileTrackPrompt(qaProfile, 'Audit test suite', ['src/test.ts'], 'qa-hunter [Audit]');

  assert.ok(prompt.includes('### 🌲 Hiyerarşik Alt Ajan (Child Subagents) ve Bağlam Yönetimi'));
  assert.ok(prompt.includes('Model unavailable'));
  assert.ok(prompt.includes('### 🌐 Dynamic Mesh & Peer Subagent Awareness'));
  assert.ok(prompt.includes('Finding: <detay>'));
});

test('TeamworkTrackBuilder enriches QA track with surgical upstream contracts and delta scope', () => {
  const profiles = getSubagentProfiles();
  const upstreamMap = new Map<string, string[]>();
  upstreamMap.set('Core', ['packages/core/src/parser.ts']);

  const subtask: DecomposedSubtask = {
    roleType: 'qa',
    label: 'Audit',
    title: 'Audit parser mutations and contracts',
    targetFiles: ['packages/core/src/parser.test.ts'],
    phase: 2,
    dependsOn: ['Core']
  };

  const groundingEngine = new TeamworkGroundingEngine();
  const track = TeamworkTrackBuilder.buildSubtaskTrack(subtask, profiles, upstreamMap, true, groundingEngine);

  assert.strictEqual(track.roleType, 'qa');
  assert.ok(track.prompt.includes('### 🎯 QA Hunter Cerrahi Odak & Üst Akış (Faz 1) Doğrulama Kapsamı'));
  assert.ok(track.prompt.includes('[Core] -> `packages/core/src/parser.ts`'));
  assert.ok(track.prompt.includes('### 🔬 QA Cerrahi Zemin & Bağlam Yönergesi'));
});
