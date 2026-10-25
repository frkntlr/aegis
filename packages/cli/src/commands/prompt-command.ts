import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkeletonGenerator, PromptCacheManager, CodebaseMemoryEngine, type LayeredPromptContext } from '@aegis/ast-skeleton';
import { GitHubClient, Context7Bridge, type GitHubIssue } from '@aegis/github-live';
import { WorktreeManager, RoleClassifier } from '@aegis/orchestrator';
import { showBanner } from './banner.js';

export interface PromptResult {
  agentName: string;
  issue: GitHubIssue;
  worktreePath: string;
  context: LayeredPromptContext;
  promptMarkdown: string;
}

function loadFromPromptDir(issueNumber: number): GitHubIssue | undefined {
  const promptDir = path.resolve(process.cwd(), '.aegis', 'prompts');
  if (!fs.existsSync(promptDir)) return undefined;
  const files = fs.readdirSync(promptDir).filter(f => f.includes(`-${issueNumber}.md`));
  if (files.length === 0) return undefined;
  const raw = fs.readFileSync(path.join(promptDir, files[0]), 'utf8');
  const targetMatches = raw.match(/Target Files:\s*([^\r\n]+)/);
  const targetFiles = targetMatches ? targetMatches[1].split(',').map(s => s.trim()).filter(Boolean) : ['packages/cli/src/bin/aegis.ts'];
  return {
    id: issueNumber,
    number: issueNumber,
    title: `Task #${issueNumber}`,
    body: raw,
    labels: ['status:ready'],
    status: 'ready',
    targetFiles,
    acceptanceCriteria: ['Pass unit tests', 'Demir Kafes 100% compliance']
  };
}

async function resolveIssue(issueNumber: number, client: GitHubClient): Promise<GitHubIssue> {
  const existing = client.getIssue(issueNumber);
  if (existing) return existing;
  const fetched = await client.fetchIssue(issueNumber);
  if (fetched) return fetched;

  const diskIssue = loadFromPromptDir(issueNumber);
  if (diskIssue) {
    client.registerIssue(diskIssue);
    return diskIssue;
  }

  const fallback: GitHubIssue = {
    id: issueNumber,
    number: issueNumber,
    title: `Task #${issueNumber}`,
    body: `Autonomous task implementation for Issue #${issueNumber}`,
    labels: ['status:ready'],
    status: 'ready',
    targetFiles: ['packages/cli/src/bin/aegis.ts'],
    acceptanceCriteria: ['Pass unit tests', 'Demir Kafes 100% compliance']
  };
  client.registerIssue(fallback);
  return fallback;
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

export function generateLanguageConstitution(targetFiles: string[]): string {
  const baseLines = [
    'Demir Kafes Constitution:',
    '1. Max 300 lines per source file.',
    '2. Max 40 lines per function.',
    '3. Surgical unified diffs only.',
    '4. Pre-commit test pass mandatory.',
    '5. Anti-Hallucination: NEVER invent non-existent APIs or imports. Verify symbols via aegis find.'
  ];

  const hasGdScript = targetFiles.some(f => /\.(gd|tscn)$/i.test(f));
  const hasTypeScript = targetFiles.some(f => /\.[jt]sx?$/i.test(f));

  if (hasGdScript) {
    baseLines.push(
      '',
      'Godot 4 Clean Component Architecture:',
      '- Decouple nodes; use Signals for upward parent communication (no Direct $\'../\' coupling).',
      '- Strictly typed GDScript: explicit parameter types and explicit return types required.',
      '- Prevent resource/node leaks: all instantiated nodes must be added to tree or freed.'
    );
  }

  if (hasTypeScript) {
    baseLines.push(
      '',
      'TypeScript Clean Domain Architecture:',
      "- Zero 'any' types: use strict domain types or unknown with type narrowing (TS_001).",
      '- Zero empty catches: swallowing exceptions without comments or handling is prohibited (TS_002).',
      '- Max nesting depth <= 4: refactor deeply nested conditionals with guard clauses (TS_003).'
    );
  }

  return baseLines.join('\n');
}

export function extractMemoryContext(targetFiles: string[], worktreeId = 'default', engine = new CodebaseMemoryEngine()): string {
  const lines: string[] = ['### 🧠 Codebase Memory & Relational Impact'];
  let found = false;
  for (const f of targetFiles) {
    const norm = f.replace(/\\/g, '/');
    let res = engine.queryMemory(norm, { worktreeId });
    if (!res.found) {
      const base = path.basename(f, path.extname(f));
      res = engine.queryMemory(base, { worktreeId });
      if (!res.found) {
        const pascal = base.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
        res = engine.queryMemory(pascal, { worktreeId });
      }
    }
    if (res.found) {
      found = true;
      lines.push(`• **Symbol:** ${res.symbol} (${res.filePath || f})`);
      lines.push(`  - **Upstream Callers:** ${res.callers.length > 0 ? res.callers.join(', ') : 'None'}`);
      lines.push(`  - **Downstream Callees:** ${res.callees.length > 0 ? res.callees.join(', ') : 'None'}`);
      lines.push(`  - **Blast Radius:** ${res.blastRadius.length} affected file(s)`);
      if (res.connectedSignals.length > 0) lines.push(`  - **Signals:** ${res.connectedSignals.join(', ')}`);
      if (res.connectedScenes.length > 0) lines.push(`  - **Scenes:** ${res.connectedScenes.join(', ')}`);
    }
  }
  if (!found) {
    lines.push('• No high-risk relational dependencies detected.');
  }
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

  const constitution = generateLanguageConstitution(issue.targetFiles);
  const cacheManager = new PromptCacheManager(constitution);

  const rawDesc = formatTaskDescription(agentName, issue);
  const memCtx = extractMemoryContext(issue.targetFiles, agentName);
  const combined = `${rawDesc}\n\n${memCtx}`;
  const taskDesc = new Context7Bridge().injectDocumentationContext(combined, issue.targetFiles);
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
  if (rawRole === 'auto' || !['solver', 'qa', 'docs', 'ui', 'contributor', 'alice', 'bob'].includes(rawRole)) {
    const classification = new RoleClassifier().classify(issue);
    if (!isJson) {
      if (classification.isAmbiguous) {
        console.log(`⚠️  Görev rolü belirsiz (Güven: %${classification.confidence} < %60)`);
        console.log(` • Gerekçe: ${classification.reason}`);
        console.log(` • Öneri: [${classification.role}]. Belirtmek için: aegis prompt <solver|qa|docs|ui> ${issueNumber}`);
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
    console.error('❌ Usage: aegis prompt [solver|qa|docs|ui] <issueId> [--save|--json]');
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
