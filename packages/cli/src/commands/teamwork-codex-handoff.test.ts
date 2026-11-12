import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodexOrchestra, type TeamworkPlan } from '@aegis/orchestrator';
import { handleTeamwork } from './teamwork-command.js';

let workspace: string;
let previous: { workspace?: string; inbox?: string };
beforeEach(() => {
  previous = { workspace: process.env.AEGIS_WORKSPACE, inbox: process.env.AEGIS_INBOX_PATH };
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-codex-handoff-'));
  process.env.AEGIS_WORKSPACE = workspace;
  process.env.AEGIS_INBOX_PATH = path.join(workspace, '.aegis/task-inbox.json');
});
afterEach(() => {
  for (const [key, value] of Object.entries({ AEGIS_WORKSPACE: previous.workspace, AEGIS_INBOX_PATH: previous.inbox })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.rmSync(workspace, { recursive: true, force: true });
});

interface NativePlan extends TeamworkPlan {
  execution: { state: string; agentsStarted: boolean; savedPlanPath: string | null; instructions: string[] };
}

test('tw Codex JSON provides a persisted executable plan without legacy dispatch fields', t => {
  const output: string[] = [];
  t.mock.method(console, 'log', (line: string) => output.push(line));
  handleTeamwork('plan', 'Implement independent engines', 'src/a.ts', 'src/b.ts', '--client=codex', '--json');
  const raw = output.join('\n');
  const plan = JSON.parse(raw) as NativePlan;
  assert.equal(plan.execution.state, 'staged');
  assert.equal(plan.execution.agentsStarted, false);
  assert.ok(plan.execution.savedPlanPath);
  const saved = JSON.parse(fs.readFileSync(plan.execution.savedPlanPath, 'utf8')) as TeamworkPlan;
  assert.deepEqual(plan.tracks.map(track => track.id), saved.tracks.map(track => track.id));
  assert.ok(plan.tracks.every(track => track.codexInvocationPayload));
  assert.doesNotMatch(raw, /invoke_subagent|"invocationPayload"|"Prompt"|"Model"/);
  assert.match(plan.execution.instructions.join('\n'), /ALL returned independent tasks before waiting/);
  const run = new CodexOrchestra(workspace).create(saved, { maxWorkers: 2 });
  assert.equal(run.planId, plan.planId);
  assert.equal(run.state, 'pending');
});

test('tw Codex preview has no saved path and creates no project state', t => {
  const output: string[] = [];
  t.mock.method(console, 'log', (line: string) => output.push(line));
  handleTeamwork('plan', 'Preview native dispatch', 'src/a.ts', '--client=codex', '--json', '--dry-run');
  const plan = JSON.parse(output.join('\n')) as NativePlan;
  assert.equal(plan.execution.state, 'preview');
  assert.equal(plan.execution.savedPlanPath, null);
  assert.equal(plan.execution.agentsStarted, false);
  assert.ok(!fs.existsSync(path.join(workspace, '.aegis/task-inbox.json')));
  assert.ok(!fs.existsSync(path.join(workspace, '.aegis/teamwork-plans')));
  assert.ok(!fs.existsSync(path.join(workspace, '.aegis/codex-orchestra')));
  assert.deepEqual(fs.readdirSync(workspace), []);
});

test('tw objective route provides native-only human handoff with its actual saved path', t => {
  const output: string[] = [];
  t.mock.method(console, 'log', (line: string) => output.push(String(line)));
  handleTeamwork('Implement engine', 'src/a.ts', '--client=codex');
  const text = output.join('\n');
  assert.match(text, /Execution: staged; no agents started/);
  assert.match(text, /Saved plan: .*teamwork-plans/);
  assert.match(text, /codex:orchestrate create/);
  assert.match(text, /native spawn tool/);
  assert.doesNotMatch(text, /invoke_subagent|"invocationPayload"|"Prompt"|"Model"/);
});
