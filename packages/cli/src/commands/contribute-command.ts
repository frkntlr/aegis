import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorktreeManager } from '@aegis/orchestrator';
import { GitHubClient, RfcTriager, NotebookLmBridge } from '@aegis/github-live';
import { compilePrompt } from './prompt-command.js';
import { showBanner } from './banner.js';

export function handleContribute(issueArg?: string, agentArg = 'contributor'): void {
  showBanner();
  if (!issueArg || issueArg === '--help' || issueArg === '-h') {
    console.error('❌ Usage: aegis contribute <issueId> [agentName]');
    process.exit(1);
  }

  const issueId = parseInt(issueArg, 10);
  const wtManager = new WorktreeManager({ persistLocks: true });
  const wt = wtManager.ensureWorktree(agentArg);
  console.log(`🚀 Preparing Contribution Workspace for Agent [@${agentArg.toUpperCase()}]...`);
  console.log(` • Worktree:   ${wt.path}`);
  console.log(` • Branch:     ${wt.branch}`);

  const client = new GitHubClient();
  const compiled = compilePrompt(agentArg, issueId, client);
  const lockResult = wtManager.acquireFileLocks(agentArg, compiled.issue.targetFiles);

  if (!lockResult.success) {
    console.error(`⚠️  Lock Conflict: Could not acquire locks for: ${lockResult.conflictingFiles.join(', ')}`);
    console.error(`   Another agent is currently modifying these files.`);
    return;
  }

  const promptDir = path.resolve(process.cwd(), '.aegis', 'prompts');
  fs.mkdirSync(promptDir, { recursive: true });
  const promptFile = path.resolve(promptDir, `${agentArg}-issue-${issueId}.md`);
  fs.writeFileSync(promptFile, compiled.promptMarkdown, 'utf8');

  console.log(`✅ File Locks Acquired: ${compiled.issue.targetFiles.join(', ')}`);
  console.log(`✅ Surgical Prompt Compiled: ${promptFile}`);
  console.log(` • Token Efficiency: ${compiled.context.cacheRatioPercent}% cached tokens`);
  console.log('\n🎯 NEXT STEPS FOR CONTRIBUTOR / AI:');
  console.log(` 1. Open worktree directory: ${wt.path}`);
  console.log(` 2. Implement changes in target files complying with Demir Kafes.`);
  console.log(` 3. Run verification:  npx aegis verify <target-file>`);
  console.log(` 4. Test atomic merge: npx aegis merge ${agentArg} master`);
}

export function handleRfcTriage(titleArg?: string, bodyArg?: string): void {
  showBanner();
  if (!titleArg) {
    console.error('❌ Usage: aegis rfc:triage "<RFC Title>" [RFC Body]');
    process.exit(1);
  }

  const triager = new RfcTriager();
  const parsed = triager.parseRfc(titleArg, bodyArg || 'Community contribution proposal', 1);
  const issue = triager.convertToIssue(parsed, 101);

  const bridge = new NotebookLmBridge();
  const note = bridge.exportRfcResearchNote(parsed);

  console.log(`🔍 RFC Discussion Triaged: "${parsed.title}"`);
  console.log(` • Category:     ${parsed.category.toUpperCase()}`);
  console.log(` • Target Name:  ${parsed.targetName}`);
  console.log(` • Target Files: ${parsed.proposedFiles.join(', ')}`);
  console.log(' • Acceptance Criteria:');
  for (const c of issue.acceptanceCriteria) {
    console.log(`    - [ ] ${c}`);
  }
  console.log(`📚 NotebookLM Research Note: ${note.filePath}`);
  console.log(`✅ Ready to convert to GitHub Issue with labels: ${issue.labels.join(', ')}`);
}

export function handleNlmSync(): void {
  showBanner();
  console.log('📚 Synchronizing Aegis Architecture & Research with NotebookLM...');
  const researchDir = path.resolve(process.cwd(), '.aegis', 'research');
  fs.mkdirSync(researchDir, { recursive: true });

  const bundleFile = path.resolve(researchDir, 'aegis-collective-knowledge.md');
  const bundleContent = [
    '# 🛡️ Aegis Collective Knowledge & Ecosystem Architecture',
    `*Generated on ${new Date().toISOString()}*`,
    '',
    '## 1. Multi-Editor & Mulgravity Support',
    '- Detects Google Antigravity (mulgravity), Cursor AI, and VS Code workspaces.',
    '- Worktrees: experimental/alice, experimental/bob, experimental/contributor.',
    '',
    '## 2. Deterministic Iron Cage (Demir Kafes)',
    '- Max 40 lines per function, max 300 lines per file.',
    '- Pre-commit quality gate strictly enforces 100% compliance before landing commits.',
    '',
    '## 3. AST Skeleton & Token Savings',
    '- Supported Languages: TypeScript, Python, GDScript, Rust.',
    '- Average Token Savings: 67% - 95%.',
    '',
    '## 4. GitHub RFC & Self-Evolving Ecosystem',
    '- Discussions RFC triage via RfcTriager.',
    '- 4-Step Atomic Merge Pipeline: Test -> Rebase -> Merge -> Sibling Sync.'
  ].join('\n');

  fs.writeFileSync(bundleFile, bundleContent, 'utf8');
  console.log(`✅ Knowledge Bundle Exported: ${bundleFile}`);
  console.log('📖 Ready for direct sync & query with NotebookLM (3767b1fc-5759-416d-b938-495b8138ccd7).');
}
