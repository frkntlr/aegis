import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { resolveSafeRepoRoot } from '@aegis/shared';
import type { TeamworkPlan } from './teamwork-types.js';
import { OrchestraStore } from './codex-orchestra-store.js';
import { getTask, reserveDispatches, settle } from './codex-orchestra-scheduler.js';
import { fileScopeKey, newTask, normalizedOptions, resolvePlanDependencies, validateGraph } from './codex-orchestra-validation.js';
import type { OrchestraDispatch, OrchestraOptions, OrchestraRun, OrchestraTaskInput } from './codex-orchestra-types.js';

export * from './codex-orchestra-types.js';

/** Persistent scheduling only: native spawning and verification belong to the host coordinator. */
export class CodexOrchestra {
  private readonly root: string;
  private readonly store: OrchestraStore;

  constructor(repoRoot?: string) {
    if (repoRoot && (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory())) {
      throw new Error('Orchestra project root must be an existing directory');
    }
    this.root = resolveSafeRepoRoot(repoRoot);
    this.store = new OrchestraStore(this.root);
  }

  public create(plan: TeamworkPlan, options: OrchestraOptions): OrchestraRun {
    if (!plan || !Array.isArray(plan.tracks) || !plan.tracks.length || typeof plan.planId !== 'string' ||
        typeof plan.objective !== 'string') throw new Error('A nonempty TeamworkPlan is required');
    const resolved = normalizedOptions(options);
    const tasks = plan.tracks.map(track => {
      const task = newTask(this.root, track, track.phase, 0);
      if (!Number.isSafeInteger(track.phase) || track.phase < 1) throw new Error('Invalid task phase');
      task.message = track.codexInvocationPayload?.message;
      return task;
    });
    resolvePlanDependencies(plan.tracks, tasks);
    const now = new Date().toISOString();
    const run: OrchestraRun = { id: randomUUID(), planId: plan.planId, objective: plan.objective,
      createdAt: now, updatedAt: now, options: resolved, tasks, state: 'pending' };
    this.store.create(run);
    return run;
  }

  public status(runId: string): OrchestraRun { return this.store.read(runId); }

  public dispatch(runId: string, availableWorkers?: number): OrchestraDispatch[] {
    return this.store.change(runId, run => reserveDispatches(run, availableWorkers));
  }

  public acknowledge(runId: string, taskId: string, agentId: string): OrchestraRun {
    return this.store.change(runId, run => {
      const task = getTask(run, taskId);
      if (typeof agentId !== 'string' || !agentId.trim()) throw new Error('Actual native agent ID is required');
      if (task.state === 'running' && task.agentId === agentId) return run;
      if (task.state !== 'reserved') throw new Error('Only a reserved task can be acknowledged');
      if (run.tasks.some(other => other.id !== taskId && ['reserved', 'running'].includes(other.state) && other.agentId === agentId)) {
        throw new Error('Native agent is already running another task');
      }
      task.state = 'running'; task.agentId = agentId; delete task.reservationId;
      settle(run);
      return run;
    });
  }

  public delegate(runId: string, parentId: string, children: OrchestraTaskInput[]): OrchestraRun {
    return this.store.change(runId, run => {
      const parent = getTask(run, parentId);
      if (parent.state !== 'running') throw new Error('Only a running task can request children');
      if (!Array.isArray(children) || !children.length) throw new Error('At least one child task is required');
      if (parent.depth >= run.options.maxDepth) throw new Error('Orchestra maxDepth exceeded');
      const tasks = children.map(input => newTask(this.root, input, parent.phase, parent.depth + 1, parentId));
      const allowed = new Set(parent.targetFiles.map(fileScopeKey));
      if (tasks.some(task => task.targetFiles.some(file => !allowed.has(fileScopeKey(file))))) {
        throw new Error('Child target files exceed parent scope');
      }
      parent.children.push(...tasks.map(task => task.id));
      run.tasks.push(...tasks);
      validateGraph(run.tasks);
      parent.state = 'waiting';
      settle(run);
      return run;
    });
  }

  public finish(runId: string, taskId: string, result: { success: boolean; evidence: string }): OrchestraRun {
    return this.store.change(runId, run => {
      const task = getTask(run, taskId);
      if (task.state !== 'running') throw new Error('Only a running task can finish');
      if (typeof result.success !== 'boolean' || typeof result.evidence !== 'string' || !result.evidence.trim()) {
        throw new Error('Completion requires a boolean outcome and verification evidence');
      }
      if (task.children.some(id => getTask(run, id).state !== 'done')) throw new Error('Child tasks must finish first');
      task.state = result.success ? 'done' : 'failed'; task.evidence = result.evidence;
      settle(run);
      return run;
    });
  }

  public cancelDispatch(runId: string, taskId: string, reason: string): OrchestraRun {
    return this.store.change(runId, run => {
      const task = getTask(run, taskId);
      if (task.state !== 'reserved' || typeof reason !== 'string' || !reason.trim()) {
        throw new Error('Only a reserved dispatch can be cancelled with a reason');
      }
      task.state = 'pending'; task.evidence = reason; delete task.reservationId;
      settle(run);
      return run;
    });
  }
}
