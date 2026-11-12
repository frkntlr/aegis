import test from 'node:test';
import assert from 'node:assert/strict';
import { getSubagentProfiles } from './teamwork-prompts.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';

const objective = 'Repair scoped state transitions';
const grounding = 'Grounded signature: export function transition(state: State, action: Action): State;';
const contract = 'Upstream contract: State { value: number }';

test('both client payloads stay bounded while retaining scope, contracts and verification', () => {
  for (const profile of getSubagentProfiles()) {
    const track = TeamworkTrackBuilder.buildTrack(profile.roleType, profile, objective,
      ['src/state.ts'], 'Measure', true, ['upstream-track'], 2, grounding, contract);
    const legacy = track.invocationPayload.Prompt;
    const native = track.codexInvocationPayload!.message;
    assert.equal(track.prompt, legacy);
    assert.equal(track.invocationPayload.TypeName, profile.name);
    assert.equal(track.invocationPayload.Model, profile.defaultModel);
    assert.equal(track.invocationPayload.Workspace, profile.workspaceMode);
    for (const prompt of [legacy, native]) {
      assert.ok(prompt.includes(objective));
      assert.ok(prompt.includes('src/state.ts'));
      assert.ok(prompt.includes('upstream-track'));
      assert.ok(prompt.includes(grounding));
      assert.ok(prompt.includes(contract));
      assert.ok(prompt.includes('aegis verify:task'));
      assert.ok(prompt.includes('[ROLE_COMPLETE:'));
      assert.ok(prompt.includes('[ROLE_FAILED:'));
      assert.doesNotMatch(prompt, /RECURSIVE DISPATCH \(MANDATORY\)|YOUR VERY FIRST ACTION MUST BE|You have full subagent tools enabled/);
    }
    assert.ok(Buffer.byteLength(legacy, 'utf8') < 3000, `${profile.roleType}: legacy payload expanded`);
    assert.ok(Buffer.byteLength(native, 'utf8') < 2100, `${profile.roleType}: native payload expanded`);
    assert.equal(native.split(`Objective: ${objective}`).length - 1, 1);
    assert.equal(native.split(objective).length - 1, 1, 'same track objective need not be repeated in identity');
    assert.doesNotMatch(native, /invoke_subagent|define_subagent/);
  }
});

test('empty file scopes remain read-only for both clients', () => {
  const profile = getSubagentProfiles()[0];
  const track = TeamworkTrackBuilder.buildTrack('solver', profile, 'Inspect status', [], 'Read', true);
  assert.match(track.prompt, /Read-only; do not edit project files/);
  assert.match(track.codexInvocationPayload!.message, /read-only; do not edit project files/);
});
