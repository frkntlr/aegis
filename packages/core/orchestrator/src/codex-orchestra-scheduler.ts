import { randomUUID } from 'node:crypto';
import type { OrchestraDispatch, OrchestraRun, OrchestraTask } from './codex-orchestra-types.js';

export function getTask(run: OrchestraRun, id: string): OrchestraTask {
  const task = run.tasks.find(t => t.id === id);
  if (!task) throw new Error(`Unknown orchestra task: ${id}`);
  return task;
}

export function settle(run: OrchestraRun): void {
  for (let pass = 0; pass <= run.tasks.length; pass++) {
    let changed = false;
    for (const task of run.tasks) {
      if (!['pending', 'waiting'].includes(task.state)) continue;
      const failed = run.tasks.some(other => ['failed', 'blocked'].includes(other.state) &&
        (task.dependsOn.includes(other.id) || task.children.includes(other.id) || other.phase < task.phase));
      if (failed) { task.state = 'blocked'; task.evidence = 'A prerequisite or child failed'; changed = true; }
      else if (task.state === 'waiting' && task.children.every(id => getTask(run, id).state === 'done')) {
        task.state = 'pending'; changed = true;
      }
    }
    if (!changed) break;
  }
  run.state = run.tasks.every(t => t.state === 'done') ? 'done'
    : run.tasks.some(t => ['failed', 'blocked'].includes(t.state)) ? 'failed'
      : run.tasks.some(t => t.state !== 'pending') ? 'active' : 'pending';
}

function hasFileConflict(candidate: OrchestraTask, active: OrchestraTask[]): boolean {
  const files = active.flatMap(t => t.targetFiles.map(f => f.toLowerCase()));
  return candidate.targetFiles.some(file => files.some(other => {
    const target = file.toLowerCase();
    return target === other || target.startsWith(`${other}/`) || other.startsWith(`${target}/`);
  }));
}

function isAncestor(run: OrchestraRun, ancestor: OrchestraTask, task: OrchestraTask): boolean {
  let parentId = task.parentId;
  while (parentId) {
    if (parentId === ancestor.id) return true;
    parentId = getTask(run, parentId).parentId;
  }
  return false;
}

function hasWaitingScopeConflict(run: OrchestraRun, task: OrchestraTask): boolean {
  // Delegation yields a worker slot, but the parent retains its shared file locks.
  const owners = run.tasks.filter(owner => owner.state === 'waiting' && !isAncestor(run, owner, task));
  return hasFileConflict(task, owners);
}

function isReady(run: OrchestraRun, task: OrchestraTask): boolean {
  return task.state === 'pending' && task.dependsOn.every(id => getTask(run, id).state === 'done') &&
    run.tasks.every(other => other.phase >= task.phase || other.state === 'done');
}

function dispatchMessage(run: OrchestraRun, task: OrchestraTask): string {
  const results = task.children.map(id => { const child = getTask(run, id); return `${id}: ${child.evidence}`; });
  return [
    task.message ?? `Aegis task: ${task.title}`,
    `Orchestra run: ${run.id}; task: ${task.id}; logical parent: ${task.parentId ?? 'root'}; depth: ${task.depth}.`,
    `Project scope: ${task.targetFiles.join(', ') || 'read-only; do not edit files'}.`,
    'Use native Codex tools, inherit the current model and follow AGENTS.md. Respect existing inbox and file locks.',
    'Run/task IDs are not inbox IDs. Do not pull arbitrary inbox tasks; claim only an exact numeric inbox ID separately confirmed by root.',
    'The root coordinator must acknowledge the actual native agent ID before this task is running.',
    'To request children, write a JSON array of {id,title,targetFiles,dependsOn?} within your assigned file scope.',
    'A read-only project scope permits only orchestration control JSON under .aegis/codex-orchestra/ for such requests; it grants no source editing permission.',
    `Submit with aegis codex:orchestrate delegate ${run.id} ${task.id} <children.json>.`,
    'After delegation, end your current turn and return the request to root. Do not wait while occupying a worker slot.',
    run.options.mode === 'nested' ? 'Nested dispatch is permitted only when the host exposes native spawn and capacity.'
      : 'Child work is dispatched by root; do not call missing child spawn tools.',
    'The host active-turn/thread limits remain authoritative; orchestra reservations do not create or close agents.',
    ...results.map(result => `Verified child result: ${result}`),
    'Return verification evidence. Root records completion only after checking the results.'
  ].join('\n');
}

export function reserveDispatches(run: OrchestraRun, availableWorkers?: number): OrchestraDispatch[] {
  if (availableWorkers !== undefined && (!Number.isSafeInteger(availableWorkers) || availableWorkers < 0)) {
    throw new Error('availableWorkers must be a nonnegative integer');
  }
  settle(run);
  const active = run.tasks.filter(t => ['reserved', 'running'].includes(t.state));
  const slots = Math.min(run.options.maxWorkers - active.length, availableWorkers ?? run.options.maxWorkers);
  const candidates = run.tasks.filter(t => isReady(run, t)).sort((a, b) => b.depth - a.depth);
  const dispatches: OrchestraDispatch[] = [];
  for (const task of candidates) {
    if (dispatches.length >= slots) break;
    if (hasFileConflict(task, active) || hasWaitingScopeConflict(run, task)) continue;
    task.state = 'reserved'; task.reservationId = randomUUID(); active.push(task);
    const parent = task.parentId ? getTask(run, task.parentId) : undefined;
    dispatches.push({ taskId: task.id, action: task.agentId ? 'resume' : 'spawn', agentId: task.agentId,
      parentId: task.parentId, dispatchOwnerId: run.options.mode === 'nested' && parent ? parent.id : 'root',
      reservationId: task.reservationId, codexInvocationPayload: {
        task_name: task.id.toLowerCase().replace(/[^a-z0-9_]/g, '_'), fork_turns: 'all', message: dispatchMessage(run, task)
      } });
  }
  settle(run);
  return dispatches;
}
