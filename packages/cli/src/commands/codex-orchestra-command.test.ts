import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleCodexOrchestra } from './codex-orchestra-command.js';

interface TaskState { id: string; state: string; parentId?: string; agentId?: string; evidence?: string }
interface RunState { id: string; tasks: TaskState[] }
interface Dispatch { taskId: string; action: string; agentId?: string; codexInvocationPayload: { message: string } }

function withProject(run: (root: string, plan: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis codex orchestra '));
  const previous = process.env.AEGIS_WORKSPACE;
  const exitCode = process.exitCode;
  process.env.AEGIS_WORKSPACE = root;
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"orchestra-fixture","private":true}');
    const plan = path.join(root, 'plan with spaces.json');
    fs.writeFileSync(plan, JSON.stringify({ planId: 'fixture-plan', objective: 'Verify orchestra CLI',
      createdAt: new Date().toISOString(), summary: 'fixture', tracks: [
        { id: 'worker-a', roleType: 'solver', subagentName: 'worker-a', title: 'Worker A',
          targetFiles: ['src/a.ts'], dependsOn: [], phase: 1, prompt: 'Read assigned file',
          invocationPayload: { TypeName: 'solver', Role: 'solver', Prompt: '', Workspace: 'inherit', Model: 'inherit' },
          codexInvocationPayload: { task_name: 'worker_a', message: 'Read assigned file', fork_turns: 'all' } }
      ] }));
    run(root, plan);
  } finally {
    if (previous === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = previous;
    process.exitCode = exitCode;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function invoke<T>(...args: string[]): T {
  const previousLog = console.log;
  const output: string[] = [];
  console.log = (...values: unknown[]) => output.push(values.map(String).join(' '));
  try { handleCodexOrchestra(...args); } finally { console.log = previousLog; }
  assert.equal(output.length, 1, 'Every operation returns exactly one JSON response');
  return JSON.parse(output[0]) as T;
}

test('orchestra CLI persists a brokered child lifecycle without touching shared inbox or locks', () => withProject((root, plan) => {
  fs.mkdirSync(path.join(root, '.aegis'));
  const inbox = path.join(root, '.aegis/task-inbox.json');
  const locks = path.join(root, '.aegis/locks.json');
  fs.writeFileSync(inbox, '[{"id":900,"status":"pending"}]');
  fs.writeFileSync(locks, '{"unrelated.ts":"another-agent"}');
  const run = invoke<RunState>('create', plan, '--workers=2');
  const first = invoke<Dispatch[]>('next', run.id);
  assert.equal(first.length, 1);
  assert.equal(first[0].action, 'spawn');
  assert.equal(invoke<RunState>('status', run.id).tasks[0].state, 'reserved');
  assert.deepEqual(invoke<Dispatch[]>('next', run.id), []);
  invoke('start', run.id, 'worker-a', '/root/native-worker');
  const children = path.join(root, 'children with spaces.json');
  fs.writeFileSync(children, JSON.stringify([{ id: 'child-a', title: 'Read child scope', targetFiles: ['src/a.ts'] }]));
  invoke('delegate', run.id, 'worker-a', children);
  const child = invoke<Dispatch[]>('next', run.id);
  assert.equal(child[0].taskId, 'child-a');
  invoke('start', run.id, 'child-a', '/root/native-child');
  invoke('complete', run.id, 'child-a', 'Verified', 'child output');
  const resumed = invoke<Dispatch[]>('next', run.id);
  assert.equal(resumed[0].taskId, 'worker-a');
  assert.equal(resumed[0].action, 'resume');
  invoke('start', run.id, 'worker-a', '/root/native-worker');
  const finished = invoke<RunState>('complete', run.id, 'worker-a', 'Reviewed child evidence');
  assert.ok(finished.tasks.every(t => t.state === 'done'));
  assert.equal(fs.readFileSync(inbox, 'utf8'), '[{"id":900,"status":"pending"}]');
  assert.equal(fs.readFileSync(locks, 'utf8'), '{"unrelated.ts":"another-agent"}');
}));

test('orchestra CLI rejects invalid options and mandatory capacity omissions', () => withProject((_root, plan) => {
  const cases = [[], ['create', plan], ['create', plan, '--workers=0'], ['create', plan, '--workers=1.5'],
    ['create', plan, '--workers=NaN'], ['create', plan, '--workers=9007199254740992'],
    ['create', plan, '--workers=1', '--workers=2'], ['create', plan, '--workers=1', '--mode=unknown'],
    ['create', plan, '--workers=1', '--max-depth=0'], ['create', plan, '--workers=1', '--dry-run'],
    ['status', 'id', 'extra'], ['next', 'id', '--available=-1'], ['complete', 'id', 'task']];
  for (const args of cases) {
    process.exitCode = 0;
    const result = invoke<{ error: string }>(...args);
    assert.ok(result.error, args.join(' '));
    assert.equal(process.exitCode, 1);
  }
}));

test('orchestra CLI returns dispatch cancellations and failed evidence accurately', () => withProject((_root, plan) => {
  const run = invoke<RunState>('create', plan, '--workers=1', '--mode=sequential', '--max-depth=2');
  invoke('next', run.id);
  const cancelled = invoke<RunState>('cancel-dispatch', run.id, 'worker-a', 'Host refused spawn');
  assert.equal(cancelled.tasks[0].state, 'pending');
  assert.deepEqual(invoke<Dispatch[]>('next', run.id, '--available=0'), []);
  invoke('next', run.id);
  invoke('start', run.id, 'worker-a', '/root/native-worker');
  const failed = invoke<RunState>('fail', run.id, 'worker-a', 'Verification failed');
  assert.equal(failed.tasks[0].state, 'failed');
  assert.equal(failed.tasks[0].evidence, 'Verification failed');
}));

test('actual CLI accepts UTF-16LE plan paths with spaces and emits machine-readable failures', () => withProject((root, plan) => {
  const utf16 = path.join(root, 'powershell plan.json');
  fs.writeFileSync(utf16, '\uFEFF' + fs.readFileSync(plan, 'utf8'), 'utf16le');
  const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const cli = path.join(engine, 'packages/cli/dist/bin/aegis.js');
  const env = { ...process.env, AEGIS_WORKSPACE: root };
  const result = execFileSync(process.execPath, [cli, 'codex:orchestrate', 'create', utf16, '--workers=1'], {
    cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 10000
  });
  assert.ok((JSON.parse(result) as RunState).id);
  const bad = spawnSync(process.execPath, [cli, 'codex:orchestrate', 'create', plan, '--workers=invalid'], {
    cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 10000
  });
  assert.equal(bad.status, 1);
  assert.match((JSON.parse(bad.stdout) as { error: string }).error, /workers/);
}));
