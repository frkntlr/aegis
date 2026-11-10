/**
 * @file teamwork-deliberate-command.test.ts
 * Tests for CLI and MCP handlers of Multi-Agent Deliberation and Semantic AI Decomposition.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { isolateTeamworkTestWorkspace } from './teamwork-test-workspace.js';
import {
  handleTeamworkDeliberate,
  mcpTeamworkDeliberate
} from './teamwork-deliberate-command.js';

isolateTeamworkTestWorkspace('deliberation');

test('handleTeamworkDeliberate executes with JSON output', async () => {
  const originalLog = console.log;
  let logged = '';
  console.log = (msg: string) => { logged += msg; };

  try {
    await handleTeamworkDeliberate('Design autonomous state machine pipeline', '--json', '--no-mesh');
    assert.ok(logged.includes('deliberationId'));
    assert.ok(logged.includes('consensusScore'));
    assert.ok(logged.includes('stateTransitions'));
  } finally {
    console.log = originalLog;
  }
});

test('handleTeamworkDeliberate handles missing objective gracefully', async () => {
  const originalErr = console.error;
  let loggedErr = '';
  console.error = (msg: string) => { loggedErr += msg; };

  try {
    await handleTeamworkDeliberate('');
    assert.ok(loggedErr.includes('Usage: aegis tw:deliberate'));
  } finally {
    console.error = originalErr;
  }
});

test('mcpTeamworkDeliberate returns structured JSON report', () => {
  const res = mcpTeamworkDeliberate({
    objective: 'Test MCP Deliberation',
    files: ['packages/cli/src/banner.ts'],
    depth: 'quick',
    persistMesh: false
  });

  const parsed = JSON.parse(res);
  assert.ok(parsed.deliberationId);
  assert.strictEqual(parsed.objective, 'Test MCP Deliberation');
  assert.ok(Array.isArray(parsed.hypotheses));
  assert.ok(Array.isArray(parsed.critiques));
  assert.ok(parsed.consensus.consensusScore > 0);
  assert.ok(Array.isArray(parsed.tasks));
});

test('mcpTeamworkDeliberate returns error when objective is missing', () => {
  const res = mcpTeamworkDeliberate({});
  const parsed = JSON.parse(res);
  assert.ok(parsed.error);
});
