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
      `Aegis ${track.roleType}${track.title !== objective ? `: ${track.title}` : ''}`,
      `Objective: ${objective}`,
      `Track: ${track.id}; phase: ${track.phase}; dependencies: ${track.dependsOn.join(', ') || 'none'}`,
      `Assigned files: ${track.targetFiles.join(', ') || 'read-only; do not edit project files'}`,
      grounding,
      'Use available native Codex tools; follow AGENTS.md and inherit the model.',
      'Claim only the exact numeric inbox task ID confirmed for this track by the root coordinator. Track IDs and shared role names are not inbox IDs; do not pull arbitrary same-role tasks.',
      'Respect .aegis/locks.json and the assigned file scope. Do not edit sibling-owned files. Ask the root for explicit scope expansion before editing other files.',
      'Delegate only when authorized, tools exist and host capacity permits. Otherwise return scoped child requests to root using codex:orchestrate delegate and end your turn; preserve run/task IDs.',
      'Root dispatches queued children and resumes you with evidence to review. Queued tasks are not running or complete.',
      'Use Aegis memory/AST queries for grounding. Report progress via aegis tw:post.',
      'Use the CLI in the active project directory unless the connected MCP project root is confirmed to match. Keep commits, pushes and external publication within explicit user authorization.',
      'Verify with relevant tests and aegis verify:task; keep <=300 lines/file, <=40 lines/function, zero any. Release only the assigned inbox ID after verification, respecting root-owned lifecycle.',
      `Report [ROLE_COMPLETE: ${track.id}] with evidence, or [ROLE_FAILED: ${track.id}] with diagnostics.`
    ].join('\n')
  };
}
