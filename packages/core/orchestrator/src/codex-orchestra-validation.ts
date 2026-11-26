import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TeamworkTrack } from './teamwork-types.js';
import type { OrchestraOptions, OrchestraRun, OrchestraTask, OrchestraTaskInput } from './codex-orchestra-types.js';
import { validateRecovery } from './codex-orchestra-recovery.js';

export function requireIdentifier(value: string): void {
  if (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_-]{0,159}$/u.test(value)) {
    throw new Error('Invalid orchestra identifier');
  }
}

export function normalizedOptions(options: OrchestraOptions): Required<OrchestraOptions> {
  const { maxWorkers, maxDepth = 8, mode = 'brokered' } = options;
  if (!Number.isSafeInteger(maxWorkers) || maxWorkers < 1) throw new Error('maxWorkers must be a positive integer');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new Error('maxDepth must be a positive integer');
  if (!['brokered', 'nested', 'sequential'].includes(mode)) throw new Error('Invalid orchestra mode');
  return { maxWorkers: mode === 'sequential' ? 1 : maxWorkers, maxDepth, mode };
}

export function normalizeFiles(root: string, files: string[]): string[] {
  if (!Array.isArray(files)) throw new Error('targetFiles must be an array');
  return [...new Set(files.map(file => normalizeFile(root, file)))];
}

export const fileScopeKey = (file: string): string => process.platform === 'win32' ? file.toLowerCase() : file;

function normalizeFile(root: string, file: string): string {
  if (typeof file !== 'string' || !file.trim()) throw new Error('Invalid target file');
  const clean = file.replace(/^res:\/\//, '').replace(/\\/g, '/');
  if (clean.split('/').includes('..') || path.isAbsolute(clean) || /^[a-zA-Z]:/.test(clean) || clean.includes(':')) {
    throw new Error(`Target file escapes project scope: ${file}`);
  }
  const normalized = path.posix.normalize(clean.replace(/^\.\//, ''));
  if (normalized === '.' || normalized.startsWith('/')) throw new Error('Invalid target file');
  const target = path.resolve(root, normalized);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) throw new Error('Targets must be files, not directories');
  let ancestor = target;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const actualRoot = fs.realpathSync(root);
  const relative = path.relative(actualRoot, fs.realpathSync(ancestor));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Target file follows a link outside project: ${file}`);
  }
  return normalized;
}

export function newTask(root: string, input: OrchestraTaskInput, phase: number, depth: number, parentId?: string): OrchestraTask {
  requireIdentifier(input.id);
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('Task title is required');
  if (input.dependsOn !== undefined && !Array.isArray(input.dependsOn)) throw new Error('dependsOn must be an array');
  return { ...input, targetFiles: normalizeFiles(root, input.targetFiles), dependsOn: input.dependsOn ?? [],
    state: 'pending', phase, depth, parentId, children: [] };
}

export function resolvePlanDependencies(tracks: TeamworkTrack[], tasks: OrchestraTask[]): void {
  for (const task of tasks) {
    task.dependsOn = [...new Set(task.dependsOn.flatMap(query => {
      const exact = tasks.find(t => t.id === query);
      if (exact) return [exact.id];
      const matches = tracks.filter(t => t.id !== task.id && t.phase <= task.phase && (t.subagentName === query ||
        t.subagentName.match(/\[([^\]]+)\]/)?.[1] === query || t.title.match(/\[([^\]]+)\]/)?.[1] === query));
      const upstream = matches.filter(t => t.phase < task.phase);
      const resolved = upstream.length ? upstream : matches;
      if (!resolved.length) throw new Error(`Unknown task dependency: ${query}`);
      return resolved.map(t => t.id);
    }))];
  }
  validateGraph(tasks);
}

function registerTaskEdges(
  task: OrchestraTask,
  table: Map<string, OrchestraTask>,
  remaining: Map<string, number>,
  consumers: Map<string, string[]>
): void {
  const prerequisites = [...new Set([...task.dependsOn, ...task.children])];
  remaining.set(task.id, prerequisites.length);
  for (const id of prerequisites) {
    const dependency = table.get(id);
    if (!dependency) throw new Error(`Unknown task dependency: ${id}`);
    if (dependency.phase > task.phase) throw new Error('Dependencies cannot point to later phases');
    consumers.set(id, [...(consumers.get(id) ?? []), task.id]);
  }
}

function countAcyclicVisits(remaining: Map<string, number>, consumers: Map<string, string[]>): number {
  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < ready.length; index++) {
    visited++;
    for (const id of consumers.get(ready[index]) ?? []) {
      const count = remaining.get(id)! - 1;
      remaining.set(id, count);
      if (count === 0) ready.push(id);
    }
  }
  return visited;
}

export function validateGraph(tasks: OrchestraTask[]): void {
  const table = new Map(tasks.map(t => [t.id, t]));
  if (table.size !== tasks.length) throw new Error('Duplicate task identifier');
  const remaining = new Map<string, number>();
  const consumers = new Map<string, string[]>();
  for (const task of tasks) {
    registerTaskEdges(task, table, remaining, consumers);
  }
  if (countAcyclicVisits(remaining, consumers) !== tasks.length) {
    throw new Error('Cyclic task dependencies');
  }
}

export function validateStoredRun(value: unknown, id: string, root: string): asserts value is OrchestraRun {
  const run = value as OrchestraRun | null;
  if (!run || run.id !== id || typeof run.planId !== 'string' || typeof run.objective !== 'string' || !Array.isArray(run.tasks)) {
    throw new Error('Invalid persisted orchestra run');
  }
  const options = normalizedOptions(run.options);
  if (run.options.maxWorkers !== options.maxWorkers || !['pending', 'active', 'done', 'failed'].includes(run.state)) {
    throw new Error('Invalid persisted orchestra state');
  }
  for (const task of run.tasks) validateStoredTask(task, run, root);
  if (run.tasks.filter(t => ['reserved', 'running'].includes(t.state)).length > options.maxWorkers) {
    throw new Error('Persisted orchestra exceeds worker capacity');
  }
  validateGraph(run.tasks);
  const expected = run.tasks.every(t => t.state === 'done') ? 'done'
    : run.tasks.some(t => ['failed', 'blocked'].includes(t.state)) ? 'failed'
      : run.tasks.some(t => t.state !== 'pending') ? 'active' : 'pending';
  if (run.state !== expected) throw new Error('Invalid persisted run state: task outcomes disagree');
}

const VALID_TASK_STATES = new Set<string>([
  'pending', 'reserved', 'running', 'waiting', 'deferred', 'done', 'failed', 'blocked'
]);
const TERMINAL_TASK_STATES = new Set<string>(['done', 'failed', 'blocked']);

const isStringArray = (values: unknown): boolean =>
  Array.isArray(values) && values.every(value => typeof value === 'string');

function hasValidTaskMetrics(task: OrchestraTask, maxDepth: number): boolean {
  if (!Number.isSafeInteger(task.phase) || task.phase < 1) return false;
  if (!Number.isSafeInteger(task.depth) || task.depth < 0 || task.depth > maxDepth) return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

function validateTaskCoreFields(task: OrchestraTask, maxDepth: number): void {
  const validState = VALID_TASK_STATES.has(task.state);
  const validArrays = [task.dependsOn, task.children, task.targetFiles].every(isStringArray);
  if (!validState || !validArrays || !hasValidTaskMetrics(task, maxDepth)) {
    throw new Error('Invalid persisted orchestra task');
  }
}

function hasMissingExecutionEvidence(task: OrchestraTask): boolean {
  if (task.state === 'running') return !task.agentId?.trim();
  if (task.state === 'reserved') return !task.reservationId?.trim();
  if (TERMINAL_TASK_STATES.has(task.state)) return !task.evidence?.trim();
  return false;
}

function validateTaskExecutionState(task: OrchestraTask): void {
  if (task.state === 'deferred' && !task.recovery) {
    throw new Error('Deferred task is missing recovery checkpoint');
  }
  if (task.recovery) validateRecovery(task.recovery);
  if (hasMissingExecutionEvidence(task)) {
    throw new Error('Persisted task is missing execution evidence');
  }
}

function validateParentLink(task: OrchestraTask, parent: OrchestraTask | undefined): void {
  if (!task.parentId) {
    if (task.depth !== 0) throw new Error('Invalid persisted task hierarchy');
    return;
  }
  const invalidParent = !parent || !parent.children.includes(task.id)
    || task.depth !== parent.depth + 1 || task.phase !== parent.phase;
  if (invalidParent) throw new Error('Invalid persisted task hierarchy');
}

function validateTaskHierarchy(task: OrchestraTask, tasks: OrchestraTask[]): void {
  const parent = task.parentId ? tasks.find(other => other.id === task.parentId) : undefined;
  validateParentLink(task, parent);
  const hasInvalidChild = task.children.some(
    id => !tasks.some(child => child.id === id && child.parentId === task.id)
  );
  if (hasInvalidChild) throw new Error('Invalid persisted child relationship');
  if (!parent) return;
  const parentKeys = new Set(parent.targetFiles.map(fileScopeKey));
  if (task.targetFiles.some(file => !parentKeys.has(fileScopeKey(file)))) {
    throw new Error('Invalid persisted child scope');
  }
}

function validateStoredTask(task: OrchestraTask, run: OrchestraRun, root: string): void {
  requireIdentifier(task.id);
  validateTaskCoreFields(task, run.options.maxDepth);
  if (JSON.stringify(normalizeFiles(root, task.targetFiles)) !== JSON.stringify(task.targetFiles)) {
    throw new Error('Invalid persisted target scope');
  }
  validateTaskExecutionState(task);
  validateTaskHierarchy(task, run.tasks);
}
