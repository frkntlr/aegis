import type { CodexOrchestra } from '@aegis/orchestrator';
import { resolveSafeRepoRoot } from '@aegis/shared';

export function orchestraRecoveryStatus(engine: CodexOrchestra, runId: string) {
  const projectRoot = resolveSafeRepoRoot();
  return {
    ...engine.recovery(runId), projectRoot, automaticWakeScheduled: false,
    hostSchedulePrompt: `In project ${JSON.stringify(projectRoot)}, run $aegis tw resume ${runId}. ` +
      'Read durable checkpoints, inspect and reconcile native agents and confirm stopped agents before redispatch. ' +
      'Skip completed work, preserve verified results and obey each task\'s not-before resumeAfter time. ' +
      'Dispatch eligible work only within actual host capacity; verify evidence before completing tasks.'
  };
}

export function listOrchestraRecovery(engine: CodexOrchestra): unknown {
  return engine.list().map(run => ({
    id: run.id, planId: run.planId, objective: run.objective, state: run.state, updatedAt: run.updatedAt,
    recoverable: run.tasks.some(task => ['pending', 'deferred', 'reserved', 'running', 'waiting'].includes(task.state)),
    recovery: orchestraRecoveryStatus(engine, run.id)
  }));
}

/** Inspect durable checkpoints; native execution still needs the active host coordinator. */
export function orchestraResumeHandoff(engine: CodexOrchestra, runId: string): unknown {
  return {
    run: engine.status(runId), recovery: orchestraRecoveryStatus(engine, runId), nativeDispatchStarted: false,
    automaticWakeScheduled: false,
    instructions: [
      'This is a read-only recovery handoff: no task was reserved, no agent was started, and no model wake-up was scheduled.',
      'Preserve verified task results and checkpoints. Reconcile running/reserved native agents with the host before dispatching more work.',
      'A deferred task is ineligible before its resumeAfter. A due task still requires satisfied dependencies, available capacity and shared locks.',
      'Use the pinned Aegis CLI from this project; a package.json or npm command in the target project is not required.',
      `When host capacity is available, call aegis codex:orchestrate next ${runId} --available=N.`,
      'Dispatch every ready independent item using codexInvocationPayload.message before waiting; for resume, follow up on its recorded native agent when available, otherwise spawn a replacement with the checkpoint.',
      'Acknowledge real native identity with start only after successful dispatch. Verify returned evidence before complete, then refill free slots.',
      'If a task must wait for credits or model access, defer it only after confirming its native agent stopped; keep the checkpoint and explicit UTC resume-after time.',
      'A future resume-after time gates eligibility. Automatic future model execution requires a separate host scheduling feature.'
    ]
  };
}
