import test, { type TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleCodexOrchestra } from './codex-orchestra-command.js';
import { handleTeamwork } from './teamwork-command.js';

interface Task { id: string; state: string; evidence?: string; recovery?: { reason: string; checkpoint: string; resumeAfter: string } }
interface Run { id: string; tasks: Task[] }

function fixture(t: TestContext): { root: string; plan: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis resume project with spaces '));
  const previous = process.env.AEGIS_WORKSPACE;
  const exitCode = process.exitCode;
  process.env.AEGIS_WORKSPACE = root;
  t.after(() => {
    if (previous === undefined) delete process.env.AEGIS_WORKSPACE; else process.env.AEGIS_WORKSPACE = previous;
    process.exitCode = exitCode;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const plan = path.join(root, 'saved plan.json');
  fs.writeFileSync(plan, JSON.stringify({ planId: 'tw-resume-fixture', objective: 'Resume verified work',
    tracks: ['verified', 'interrupted'].map(id => ({ id, title: id, targetFiles: [`src/${id}.ts`],
      phase: 1, dependsOn: [], roleType: 'solver', subagentName: id, prompt: '',
      invocationPayload: { TypeName: 'solver', Role: id, Prompt: '', Workspace: 'inherit', Model: 'inherit' },
      codexInvocationPayload: { task_name: id, message: `Handle ${id}`, fork_turns: 'all' } })) }));
  return { root, plan };
}

function capture<T>(callback: () => void): T {
  const previous = console.log;
  const lines: string[] = [];
  console.log = (...values: unknown[]) => lines.push(values.map(String).join(' '));
  try { callback(); } finally { console.log = previous; }
  assert.equal(lines.length, 1);
  return JSON.parse(lines[0]) as T;
}
function invoke<T>(...args: string[]): T { return capture(() => handleCodexOrchestra(...args)); }

function running(t: TestContext): { root: string; run: Run } {
  const { root, plan } = fixture(t);
  const run = invoke<Run>('create', plan, '--workers=2');
  invoke('next', run.id);
  invoke('start', run.id, 'verified', '/root/verified-agent');
  invoke('complete', run.id, 'verified', 'Unit tests passed; reviewed result');
  invoke('start', run.id, 'interrupted', '/root/interrupted-agent');
  return { root, run };
}

test('defer requires stopped acknowledgment and UTC time without altering prior results', t => {
  const { root, run } = running(t);
  const record = path.join(root, '.aegis/codex-orchestra', `${run.id}.json`);
  const before = fs.readFileSync(record, 'utf8');
  for (const flags of [[], ['--resume-after=2099-01-01T00:00:00Z'],
    ['--resume-after=2099-02-30T00:00:00Z', '--agent-stopped'],
    ['--resume-after=2099-01-01T00:00:00Z', '--agent-stopped=false']]) {
    process.exitCode = 0;
    const result = invoke<{ error: string }>('defer', run.id, 'interrupted', 'Model credits unavailable', ...flags);
    assert.ok(result.error);
    assert.equal(process.exitCode, 1);
    assert.equal(fs.readFileSync(record, 'utf8'), before);
  }
  process.exitCode = 0;
  const deferred = invoke<Run>('defer', run.id, 'interrupted', 'Model credits unavailable',
    '--checkpoint=Parser implemented; remaining check is integration test', '--resume-after=2099-01-01T00:00:00Z', '--agent-stopped');
  assert.equal(deferred.tasks[0].state, 'done');
  assert.equal(deferred.tasks[0].evidence, 'Unit tests passed; reviewed result');
  assert.equal(deferred.tasks[1].state, 'deferred');
  assert.equal(deferred.tasks[1].recovery?.checkpoint, 'Parser implemented; remaining check is integration test');
  assert.equal(deferred.tasks[1].recovery?.resumeAfter, '2099-01-01T00:00:00.000Z');
  assert.deepEqual(invoke('next', run.id), []);
});

test('list, status discovery and tw resume expose checkpoints without reserving tasks or waking agents', t => {
  const { root, run } = running(t);
  invoke('defer', run.id, 'interrupted', 'Credits exhausted; retain checked files',
    '--resume-after=2099-01-01T00:00:00Z', '--agent-stopped');
  const record = path.join(root, '.aegis/codex-orchestra', `${run.id}.json`);
  const before = fs.readFileSync(record, 'utf8');
  const listed = invoke<Array<{ id: string; recoverable: boolean }>>('list');
  assert.equal(listed[0].id, run.id);
  assert.equal(listed[0].recoverable, true);
  assert.equal(invoke<unknown[]>('status').length, 1);
  const resume = capture<{ nativeDispatchStarted: boolean; automaticWakeScheduled: boolean; run: Run;
    recovery: { deferred: Array<{ due: boolean; checkpoint: string }>; automaticWakeScheduled: boolean; hostSchedulePrompt: string }; instructions: string[] }>(
    () => handleTeamwork('resume', run.id, '--json'));
  assert.equal(resume.nativeDispatchStarted, false);
  assert.equal(resume.automaticWakeScheduled, false);
  assert.equal(resume.recovery.automaticWakeScheduled, false);
  assert.match(resume.recovery.hostSchedulePrompt, /\$aegis tw resume/);
  assert.match(resume.recovery.hostSchedulePrompt, /Skip completed work.*not-before/);
  assert.ok(resume.recovery.hostSchedulePrompt.includes(root.replace(/\\/g, '\\\\')));
  assert.equal(resume.run.tasks[0].state, 'done');
  assert.equal(resume.recovery.deferred[0].due, false);
  assert.equal(resume.recovery.deferred[0].checkpoint, 'Credits exhausted; retain checked files');
  assert.match(resume.instructions.join('\n'), /no model wake-up was scheduled/);
  assert.equal(fs.readFileSync(record, 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(root, 'package.json')));
});

test('already due recovery keeps native identity and produces a resume dispatch', t => {
  const { run } = running(t);
  invoke('defer', run.id, 'interrupted', 'Resume remaining tests', '--resume-after=2000-01-01T00:00:00Z', '--agent-stopped');
  const recovery = invoke<{ deferred: Array<{ due: boolean }> }>('recovery', run.id);
  assert.equal(recovery.deferred[0].due, true);
  const dispatches = invoke<Array<{ action: string; agentId: string; codexInvocationPayload: { message: string } }>>('next', run.id);
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].action, 'resume');
  assert.equal(dispatches[0].agentId, '/root/interrupted-agent');
  assert.match(dispatches[0].codexInvocationPayload.message, /Resume remaining tests/);
});

test('actual pinned CLI resumes from a target without package.json or npm', t => {
  const { root, plan } = fixture(t);
  const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const cli = path.join(engine, 'packages/cli/dist/bin/aegis.js');
  const env = { ...process.env, AEGIS_WORKSPACE: root };
  const command = <T>(...args: string[]): T => JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 10000
  })) as T;
  const run = command<Run>('codex:orchestrate', 'create', plan, '--workers=2');
  command('codex:orchestrate', 'next', run.id);
  command('codex:orchestrate', 'start', run.id, 'interrupted', '/root/native-from-pinned-cli');
  command('codex:orchestrate', 'defer', run.id, 'interrupted', 'Credits unavailable; checkpoint saved',
    '--resume-after=2099-01-01T00:00:00Z', '--agent-stopped');
  const result = command<{ nativeDispatchStarted: boolean; run: Run }>('tw', 'resume', run.id);
  assert.equal(result.nativeDispatchStarted, false);
  assert.equal(result.run.tasks[1].state, 'deferred');
  assert.ok(!fs.existsSync(path.join(root, 'package.json')));
  assert.ok(!fs.existsSync(path.join(root, 'node_modules')));
});
