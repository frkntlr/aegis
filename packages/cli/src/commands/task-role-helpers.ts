/**
 * @file task-role-helpers.ts
 * Leaf helpers for normalizing agent roles and GitHub issue closure guidance.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export function normalizeRole(rawRole?: string): string {
  const r = (rawRole || 'solver').toLowerCase().trim();
  if (r.includes('qa')) return 'qa-hunter';
  if (r.includes('ui')) return 'ui-specialist';
  if (r.includes('doc')) return 'doc-architect';
  return 'issue-solver';
}

/** Local completion is not remote quality proof; closure uses the explicit evidence workflow. */
export async function closeGitHubIssueIfConfigured(issueNum: number, _agent?: string): Promise<void> {
  console.log(`Local task complete; GitHub issue #${issueNum} remains open until explicit proof-based closure.`);
  console.log('Use aegis tw:gh:close <full-commit-hash> "<summary>" <remote-issue-number> <proof.json>.');
}
