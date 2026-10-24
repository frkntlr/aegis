import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SystemIssue } from './realtime-metrics.js';

export function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', 'dist', '.git', 'experimental', 'worktrees'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectSourceFiles(full));
      } else if (/\.(ts|tsx|py|gd|rs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        results.push(full);
      }
    }
  } catch { /* ignore */ }
  return results;
}

export function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', 'dist', '.git', 'experimental', 'worktrees'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectTestFiles(full));
      } else if (/\.(test|spec)\.(ts|js)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch { /* ignore */ }
  return results;
}

export function compilePromptFile(issue: SystemIssue, agentName: string, repoRoot: string): string {
  const promptDir = path.resolve(repoRoot, '.aegis', 'prompts');
  fs.mkdirSync(promptDir, { recursive: true });
  const promptPath = path.resolve(promptDir, `${agentName}-issue-${issue.number}.md`);
  const content = [
    `# 🎯 Task Assignment: #${issue.number} ${issue.title}`,
    `**Assigned Agent:** @${agentName.toUpperCase()} | **Status:** ${issue.status.toUpperCase()}`,
    `**Target Files:**\n${issue.targetFiles.map(f => `- \`${f}\``).join('\n')}`,
    '',
    '## Acceptance Criteria',
    ...(issue.acceptanceCriteria && issue.acceptanceCriteria.length > 0
      ? issue.acceptanceCriteria.map(c => `- [ ] ${c}`)
      : [
          '- [ ] Strict compliance with Demir Kafes (max 40 lines/function, max 300 lines/file).',
          '- [ ] All unit tests pass locally before requesting atomic merge.',
          '- [ ] Zero token bloat: only surgical unified diffs are accepted.'
        ])
  ].join('\n');
  fs.writeFileSync(promptPath, content, 'utf8');
  return promptPath;
}
