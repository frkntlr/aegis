import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkeletonGenerator, PromptCacheManager, type LayeredPromptContext } from '@aegis/ast-skeleton';
import { GitHubClient, type GitHubIssue } from '@aegis/github-live';
import { WorktreeManager, RoleClassifier } from '@aegis/orchestrator';
import { showBanner } from './banner.js';

export interface PromptResult {
  agentName: string;
  issue: GitHubIssue;
  worktreePath: string;
  context: LayeredPromptContext;
  promptMarkdown: string;
}

async function resolveIssue(issueNumber: number, client: GitHubClient): Promise<GitHubIssue> {
  const existing = client.getIssue(issueNumber);
  if (existing) return existing;
  const fetched = await client.fetchIssue(issueNumber);
  if (fetched) return fetched;

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

export async function compilePrompt(
  agentName: string,
  issueNumber: number,
  client = new GitHubClient({ autoConnectLive: true })
): Promise<PromptResult> {
  const wtManager = new WorktreeManager();
  const worktreePath = wtManager.getWorktreePath(agentName);
  const issue = await resolveIssue(issueNumber, client);

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

function parsePromptArgs(agentArg?: string, issueArg?: string, flag?: string) {
  if (agentArg && !isNaN(parseInt(agentArg, 10))) {
    return {
      role: 'auto',
      issueNumber: parseInt(agentArg, 10),
      flag: issueArg?.startsWith('--') ? issueArg : flag
    };
  }
  return {
    role: agentArg || 'solver',
    issueNumber: parseInt(issueArg || '1', 10),
    flag
  };
}

async function resolveRoleAndIssue(
  rawRole: string,
  issueNumber: number,
  isJson: boolean,
  client = new GitHubClient({ autoConnectLive: true })
): Promise<{ role: string; issueNumber: number; issue: GitHubIssue }> {
  const issue = await resolveIssue(issueNumber, client);
  if (rawRole === 'auto' || !['solver', 'qa', 'docs', 'alice', 'bob'].includes(rawRole)) {
    const classification = new RoleClassifier().classify(issue);
    if (!isJson) {
      if (classification.isAmbiguous) {
        console.log(`⚠️  Görev rolü belirsiz (Güven: %${classification.confidence} < %60)`);
        console.log(` • Gerekçe: ${classification.reason}`);
        console.log(` • Öneri: [${classification.role}]. Belirtmek için: aegis prompt <solver|qa|docs> ${issueNumber}`);
      } else {
        console.log(`🎯 Otomatik Rol Atandı: [${classification.role.toUpperCase()}] (Güven: %${classification.confidence})`);
        console.log(` • Gerekçe: ${classification.reason}`);
      }
    }
    return { role: classification.role, issueNumber, issue };
  }
  return { role: rawRole, issueNumber, issue };
}

export async function handlePrompt(agentArg?: string, issueArg?: string, flag?: string): Promise<void> {
  const parsedArgs = parsePromptArgs(agentArg, issueArg, flag);
  const isJson = parsedArgs.flag === '--json';
  if (!isJson) showBanner();

  if (!agentArg || agentArg === '--help' || agentArg === '-h') {
    console.error('❌ Usage: aegis prompt [solver|qa|docs] <issueId> [--save|--json]');
    process.exit(1);
  }

  const { role, issueNumber } = await resolveRoleAndIssue(parsedArgs.role, parsedArgs.issueNumber, isJson);
  const result = await compilePrompt(role, issueNumber);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`🤖 Cerrahi Prompt Compiler: Agent [${result.agentName.toUpperCase()}] -> Issue #${issueNumber}`);
  console.log(` • Worktree:     ${result.worktreePath}`);
  console.log(` • Target Files: ${result.issue.targetFiles.join(', ')}`);
  console.log(` • Cached Ratio: ${result.context.cacheRatioPercent}% efficiency (${result.context.cachedCharacters} chars)`);

  if (parsedArgs.flag === '--save') {
    const dir = path.resolve(process.cwd(), '.aegis', 'prompts');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.resolve(dir, `${result.agentName}-issue-${issueNumber}.md`);
    fs.writeFileSync(target, result.promptMarkdown, 'utf8');
    console.log(`✅ Compiled prompt saved to: ${target}`);
  } else {
    console.log('\n--- COMPILED SURGICAL PROMPT ---');
    console.log(result.promptMarkdown);
    console.log('--- END OF PROMPT ---\n');
  }
}
