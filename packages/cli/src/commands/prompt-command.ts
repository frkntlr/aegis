import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkeletonGenerator, PromptCacheManager, type LayeredPromptContext } from '@aegis/ast-skeleton';
import { GitHubClient, type GitHubIssue } from '@aegis/github-live';
import { WorktreeManager } from '@aegis/orchestrator';
import { showBanner } from './banner.js';

export interface PromptResult {
  agentName: string;
  issue: GitHubIssue;
  worktreePath: string;
  context: LayeredPromptContext;
  promptMarkdown: string;
}

function resolveIssue(issueNumber: number, client: GitHubClient): GitHubIssue {
  const existing = client.getIssue(issueNumber);
  if (existing) return existing;

  const mock: GitHubIssue = {
    id: issueNumber,
    number: issueNumber,
    title: `Issue #${issueNumber}`,
    body: `Autonomous task implementation for Issue #${issueNumber}`,
    labels: ['status:ready'],
    status: 'ready',
    targetFiles: ['packages/cli/src/bin/aegis.ts'],
    acceptanceCriteria: ['Pass unit tests', 'Demir Kafes 100% compliance']
  };
  client.registerIssue(mock);
  return mock;
}

function formatTaskDescription(agentName: string, issue: GitHubIssue): string {
  const lines = [
    `Assigned Agent: @${agentName.toUpperCase()}`,
    `Worktree Directory: experimental/${agentName}`,
    `Issue #${issue.number}: ${issue.title}`,
    `Description: ${issue.body}`,
    `Target Files: ${issue.targetFiles.join(', ')}`,
    'Acceptance Criteria:',
    ...issue.acceptanceCriteria.map(c => ` - [ ] ${c}`),
    '',
    'Output Requirement: Surgical unified diffs ONLY. Do not emit full file rewrites.'
  ];
  return lines.join('\n');
}

export function compilePrompt(
  agentName: string,
  issueNumber: number,
  client = new GitHubClient()
): PromptResult {
  const wtManager = new WorktreeManager();
  const worktreePath = wtManager.getWorktreePath(agentName);
  const issue = resolveIssue(issueNumber, client);

  const generator = new SkeletonGenerator();
  const skeletonResult = generator.generateForFiles(issue.targetFiles, process.cwd());

  const cacheManager = new PromptCacheManager(
    'Demir Kafes Constitution:\n1. Max 300 lines per source file.\n2. Max 40 lines per function.\n3. Surgical unified diffs only.\n4. Pre-commit test pass mandatory.'
  );

  const taskDesc = formatTaskDescription(agentName, issue);
  const context = cacheManager.assembleContext(skeletonResult.combinedMap, taskDesc);

  const promptMarkdown = [
    context.constitutionBlock.text,
    '',
    context.skeletonMapBlock.text,
    '',
    context.taskBlock.text
  ].join('\n');

  return { agentName, issue, worktreePath, context, promptMarkdown };
}

export function handlePrompt(agentArg?: string, issueArg?: string, flag?: string): void {
  if (flag !== '--json') {
    showBanner();
  }
  if (!agentArg || !issueArg || agentArg === '--help' || agentArg === '-h') {
    console.error('❌ Usage: aegis prompt <alice|bob> <issueId> [--save|--json]');
    process.exit(1);
  }

  const issueNumber = parseInt(issueArg, 10);
  const result = compilePrompt(agentArg, issueNumber);

  if (flag === '--json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`🤖 Cerrahi Prompt Compiler: Agent [${result.agentName.toUpperCase()}] -> Issue #${issueNumber}`);
  console.log(` • Worktree:     ${result.worktreePath}`);
  console.log(` • Target Files: ${result.issue.targetFiles.join(', ')}`);
  console.log(` • Total Chars:  ${result.context.totalCharacters} chars`);
  console.log(` • Cached Chars: ${result.context.cachedCharacters} chars (${result.context.cacheRatioPercent}% prompt caching efficiency)`);

  if (flag === '--save') {
    const dir = path.resolve(process.cwd(), '.aegis', 'prompts');
    fs.mkdirSync(dir, { recursive: true });
    const targetFile = path.resolve(dir, `${result.agentName}-issue-${issueNumber}.md`);
    fs.writeFileSync(targetFile, result.promptMarkdown, 'utf8');
    console.log(`✅ Compiled prompt saved to: ${targetFile}`);
  } else {
    console.log('\n--- COMPILED SURGICAL PROMPT ---');
    console.log(result.promptMarkdown);
    console.log('--- END OF PROMPT ---\n');
  }
}
