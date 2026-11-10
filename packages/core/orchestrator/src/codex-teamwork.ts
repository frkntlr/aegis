import type { TeamworkTrack } from './teamwork-types.js';

export interface CodexInvocationPayload {
  task_name: string;
  message: string;
  fork_turns: 'all';
}

/** Native host tool schemas vary; the message is portable across Codex clients. */
export function buildCodexInvocation(track: Pick<TeamworkTrack,
  'id' | 'title' | 'targetFiles' | 'dependsOn' | 'phase' | 'roleType'>, objective: string, grounding = ''): CodexInvocationPayload {
  return {
    task_name: track.id.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    fork_turns: 'all',
    message: [
      `Aegis ${track.roleType}: ${track.title}`,
      `Objective: ${objective}`,
      `Track: ${track.id}; phase: ${track.phase}; dependencies: ${track.dependsOn.join(', ') || 'none'}`,
      `Assigned files: ${track.targetFiles.join(', ') || 'inspect scope before editing'}`,
      grounding,
      'Use native Codex terminal/MCP tools and follow AGENTS.md. Inherit the active model.',
      'Pull/claim the staged task and respect .aegis/locks.json. Do not edit sibling-owned files.',
      'Delegate only when supported, authorized and capacity permits. Never call Antigravity-only tools.',
      'Use Aegis memory/AST queries for grounding. Report progress via aegis tw:post.',
      'Verify with relevant tests and aegis verify:task; keep <=300 lines/file, <=40 lines/function, zero any.',
      'Release the actual inbox task ID as done only after verification, or blocked with the failure reason.',
      `Report [ROLE_COMPLETE: ${track.id}] with evidence, or [ROLE_FAILED: ${track.id}] with diagnostics.`
    ].join('\n')
  };
}
