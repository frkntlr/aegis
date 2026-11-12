import type { TeamworkPlan } from '@aegis/orchestrator';
import { teamworkPlanPath } from './teamwork-plan-store.js';

/** Native tools belong to the host; the CLI only stages a portable execution handoff. */
export function printCodexHandoff(plan: TeamworkPlan, json: boolean, dryRun: boolean): void {
  const tracks = plan.tracks.map(({ prompt: _prompt, invocationPayload: _legacy, ...native }) => native);
  const execution = {
    state: dryRun ? 'preview' : 'staged',
    agentsStarted: false,
    savedPlanPath: dryRun ? null : teamworkPlanPath(plan.planId),
    instructions: [
      dryRun ? 'Preview only: do not stage, claim or dispatch tasks.'
        : 'Create an execution record from savedPlanPath: aegis codex:orchestrate create <plan-path> --workers=N --mode=brokered.',
      'N is actual host worker capacity excluding root. The CLI does not launch agents.',
      'Call codex:orchestrate next <run> --available=N; dispatch ALL returned independent tasks before waiting for any result.',
      'Use each codexInvocationPayload.message with the native spawn tool, inherit the model and respect shared file locks.',
      'Claim only the confirmed numeric inbox ID; record start <run> <task> <real-agent-id> only after native dispatch succeeds.',
      'As workers finish, verify evidence, complete or fail their tasks, release verified inbox tasks and refill free slots with next.',
      'Continue until run status is done or explicitly failed; staged and reserved tasks are not running.'
    ]
  };
  if (json) { console.log(JSON.stringify({ ...plan, tracks, execution }, null, 2)); return; }
  console.log(`Codex teamwork plan: ${plan.planId}\nObjective: ${plan.objective}`);
  console.log(`Execution: ${execution.state}; no agents started.`);
  if (execution.savedPlanPath) console.log(`Saved plan: ${execution.savedPlanPath}`);
  for (const instruction of execution.instructions) console.log(instruction);
  for (const track of tracks) {
    console.log(`\nTrack ${track.id}; phase ${track.phase}; dependencies: ${track.dependsOn.join(', ') || 'none'}`);
    console.log(JSON.stringify(track.codexInvocationPayload, null, 2));
  }
}
