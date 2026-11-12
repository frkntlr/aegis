import type { OrchestraDeferralInput, OrchestraRecovery, OrchestraRecoveryStatus, OrchestraRun, OrchestraTask } from './codex-orchestra-types.js';

export function recoveryTimestamp(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error('Recovery timestamp must be an explicit UTC ISO timestamp ending in Z');
  }
  const stamp = Date.parse(value);
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString() !== canonical) throw new Error('Invalid recovery timestamp');
  return canonical;
}

export function validateRecovery(value: OrchestraRecovery): void {
  if (!value || value.agentStopped !== true || typeof value.reason !== 'string' || !value.reason.trim() ||
      value.reason.length > 4000 || typeof value.checkpoint !== 'string' || !value.checkpoint.trim() ||
      value.checkpoint.length > 16000 || (value.lastAgentId !== undefined &&
        (typeof value.lastAgentId !== 'string' || !value.lastAgentId.trim()))) {
    throw new Error('Recovery requires a reason, checkpoint and explicit agentStopped confirmation');
  }
  recoveryTimestamp(value.resumeAfter);
  recoveryTimestamp(value.deferredAt);
}

export function deferOrchestraTask(task: OrchestraTask, input: OrchestraDeferralInput): void {
  if (!['running', 'reserved'].includes(task.state)) throw new Error('Only a running or reserved task can be deferred');
  const recovery: OrchestraRecovery = { ...input, resumeAfter: recoveryTimestamp(input?.resumeAfter),
    deferredAt: new Date(Date.now()).toISOString(), lastAgentId: task.agentId };
  validateRecovery(recovery);
  task.recovery = recovery;
  task.state = 'deferred';
  delete task.reservationId;
}

export function recoveryStatus(run: OrchestraRun): OrchestraRecoveryStatus {
  const now = Date.now();
  const deferred = run.tasks.filter(task => task.state === 'deferred').map(task => ({
    ...task.recovery!, taskId: task.id, due: Date.parse(task.recovery!.resumeAfter) <= now
  }));
  const future = deferred.filter(task => !task.due).map(task => task.resumeAfter).sort();
  return { runId: run.id, state: run.state, checkedAt: new Date(now).toISOString(),
    deferred, nextResumeAfter: future[0] };
}
