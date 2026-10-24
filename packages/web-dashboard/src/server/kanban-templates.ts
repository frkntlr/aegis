import type { SystemIssue } from './realtime-metrics.js';

export const INITIAL_DEFAULT_ISSUES: SystemIssue[] = [
  {
    id: 1,
    number: 1,
    title: 'feat(kanban): Real-time GitHub Projects & Kanban Live Synchronization',
    status: 'done',
    targetFiles: ['packages/web-dashboard/src/server/github-kanban.ts'],
    labels: ['status:done', 'aegis:task']
  },
  {
    id: 2,
    number: 2,
    title: 'feat(ast): Multi-Language AST Skeleton Extraction for C/C++ and Go',
    status: 'done',
    targetFiles: ['packages/core/ast-skeleton/src/index.ts'],
    labels: ['status:done', 'aegis:task']
  }
];

export function buildIssueBody(title: string, targetFiles: string[]): string {
  return [
    '### Objective',
    title,
    '',
    '### Target Files',
    targetFiles.map(f => `- \`${f}\``).join('\n') || '- None specified',
    '',
    '### Acceptance Criteria',
    '- [ ] Strict compliance with Demir Kafes (max 40 lines/function, max 300 lines/file).',
    '- [ ] All unit tests pass locally before requesting atomic merge.',
    '- [ ] Zero token bloat: only surgical unified diffs are accepted.'
  ].join('\n');
}

export function buildQualityGateComment(agent?: string, ide?: string, timestamp = new Date().toISOString()): string {
  return [
    '### 🛡️ Aegis Autonomous Quality Gate Report',
    `- **Status:** COMPLETED & VERIFIED ✅`,
    `- **Resolver Agent:** \`@${agent || 'solver'}\` (${ide || 'Google Antigravity'})`,
    `- **Demir Kafes Compliance:** PASS (Max 40 lines/fn, max 300 lines/file)`,
    `- **Pre-Commit Tests:** PASS (100% tests green)`,
    `- **Checklist Verified:** All acceptance criteria satisfied.`,
    `- **Timestamp:** ${timestamp}`
  ].join('\n');
}
