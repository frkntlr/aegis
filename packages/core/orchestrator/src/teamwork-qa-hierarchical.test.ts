import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  QA_SYSTEM_PROMPT, SOLVER_SYSTEM_PROMPT, UI_SPECIALIST_SYSTEM_PROMPT,
  DOC_ARCHITECT_SYSTEM_PROMPT, compileTrackPrompt, getSubagentProfiles
} from './teamwork-prompts.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import { TeamworkHierarchicalTree } from './teamwork-hierarchical-tree.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';

test('QA_SYSTEM_PROMPT embeds Hierarchical Recursive Execution protocol', () => {
  assert.ok(QA_SYSTEM_PROMPT.includes('Hierarchical Recursive Execution'));
  assert.ok(QA_SYSTEM_PROMPT.includes('invoke_subagent'));
  assert.ok(QA_SYSTEM_PROMPT.includes('child QA subagents'));
  assert.ok(QA_SYSTEM_PROMPT.includes('verify:task'));
});

test('All subagent system prompts embed Recursive Multi-Tier Subagent mandates', () => {
  assert.ok(SOLVER_SYSTEM_PROMPT.includes('Recursive Multi-Tier Subagents'));
  assert.ok(SOLVER_SYSTEM_PROMPT.includes('invoke_subagent'));
  assert.ok(UI_SPECIALIST_SYSTEM_PROMPT.includes('Recursive Multi-Tier Subagents'));
  assert.ok(DOC_ARCHITECT_SYSTEM_PROMPT.includes('Recursive Multi-Tier Subagents'));
});

test('TeamworkHierarchicalTree provides role-specific child subagent directives', () => {
  const solverDirective = TeamworkHierarchicalTree.buildChildSubagentDirective('solver');
  assert.ok(solverDirective.includes('TEK BAŞINA SIRALI OKUMA YASAĞI'));
  assert.ok(solverDirective.includes('ZORUNLU İLK HAMLE (Turn 1)'));
  assert.ok(solverDirective.includes('[Logic]'));
  assert.ok(solverDirective.includes('[Bridge]'));

  const qaDirective = TeamworkHierarchicalTree.buildChildSubagentDirective('qa');
  assert.ok(qaDirective.includes('[Playtest]'));
  assert.ok(qaDirective.includes('[Mutation]'));

  assert.ok(TeamworkHierarchicalTree.isHierarchicalRequested('otomatik iki ajan atamış alt ajan açmalı'));
  assert.ok(TeamworkHierarchicalTree.isHierarchicalRequested('recursive deep tree swarm'));
});

test('compileTrackPrompt includes Hierarchical Subagents and Dynamic Mesh guidance in footer', () => {
  const profiles = getSubagentProfiles();
  const qaProfile = profiles.find(p => p.roleType === 'qa')!;
  const prompt = compileTrackPrompt(qaProfile, 'Audit test suite', ['src/test.ts'], 'qa-hunter [Audit]');

  assert.ok(prompt.includes('### Hierarchical Subagents & Dynamic Mesh'));
  assert.ok(prompt.includes('invoke_subagent only when the host exposes it and capacity permits'));
  assert.ok(prompt.includes('aegis tw:post'));
  assert.ok(prompt.includes('exact numeric inbox ID'));
  assert.ok(!prompt.includes('RECURSIVE DISPATCH (MANDATORY)'));
  assert.ok(!prompt.includes('You have full subagent tools enabled'));
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
