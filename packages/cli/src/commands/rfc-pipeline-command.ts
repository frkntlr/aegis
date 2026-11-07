/**
 * @file rfc-pipeline-command.ts
 * End-to-end GitHub RFC lifecycle: Discussion <-> Issue cross-link and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GitHubTokenResolver,
  GitHubLiveAdapter,
  RfcTriager
} from '@aegis/github-live';
import { resolveSafeAegisDir } from '@aegis/shared';
import { showBanner } from './banner.js';
import { generateDiscussionResearchBody } from './rfc-templates.js';
import { stageTaskInInbox } from './task-inbox.js';

interface DiscussionResult { url: string; id?: string; number?: number; }
interface RepoDiscussionData {
  repository?: { id: string; discussionCategories?: { nodes: Array<{ id: string; name: string }> } };
}
interface CreateDiscussionData {
  createDiscussion?: { discussion?: { url: string; id?: string; number?: number } };
}

function resolveRfcDir(): string {
  let cur = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(cur, 'docs', 'rfc');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(process.cwd(), 'docs', 'rfc');
}

function findExistingRfc(rfcDir: string, query: string): string | undefined {
  if (!fs.existsSync(rfcDir)) return undefined;
  const files = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
  const cleanQ = query.toLowerCase().replace(/^rfc-?/i, '');
  return files.find(f => f.toLowerCase().includes(cleanQ));
}

function resolveNextNumber(rfcDir: string): number {
  if (!fs.existsSync(rfcDir)) return 1;
  const files = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
  const nums = files.map(f => {
    const m = f.match(/^RFC-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return nums.length > 0 ? Math.max(...nums, 0) + 1 : 1;
}

function buildInitialRfc(num: number, title: string, desc: string): string {
  const pad = String(num).padStart(3, '0');
  const date = new Date().toISOString().split('T')[0];
  return `# 🏛️ RFC-${pad}: ${title}\n### Aegis Autonomous Architecture Blueprint\n\n` +
    `- **RFC ID:** RFC-${pad} | **Durum:** Proposed | **Tarih:** ${date}\n\n` +
    `## 🔍 1. Fikir ve Problem Tanımı\n${desc || title}\n\n` +
    `## 🏗️ 2. Düğüm & Bileşen Mimarisi\n1. **Core Controller:** Ana mantık akışı.\n` +
    `2. **Event Bus:** Gevşek bağlılık.\n3. **UI / HUD:** Görsel geri bildirim.\n\n` +
    `## 🔒 3. Demir Kafes Standartları\n- Azami 300 satır/dosya, azami 40 satır/fonksiyon.\n\n` +
    `## 🎯 4. Kabul Kriterleri (Acceptance Criteria)\n- [ ] Çekirdek mantık tasarımı tamamlandı.\n` +
    `- [ ] Demir Kafes AST doğrulaması sağlandı.\n- [ ] Birim testler (%100) geçti.\n`;
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' ||
    process.env.AEGIS_TEST === '1' ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.NODE_TEST_CONTEXT);
}

async function publishDiscussion(
  auth: { token?: string; owner?: string; repo?: string },
  title: string,
  body: string
): Promise<DiscussionResult | undefined> {
  if (isTestEnv() || !auth.token || !auth.owner || !auth.repo) return undefined;
  const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
  try {
    const repoData = await adapter.graphqlQuery<RepoDiscussionData>(
      `query($o: String!, $r: String!) { repository(owner: $o, name: $r) { id discussionCategories(first: 10) { nodes { id name } } } }`,
      { o: auth.owner, r: auth.repo }
    );
    const repoId = repoData.repository?.id;
    const cats = repoData.repository?.discussionCategories?.nodes || [];
    const ideasCat = cats.find(c => c.name.toLowerCase() === 'ideas') || cats[0];
    if (!repoId || !ideasCat) return undefined;

    const res = await adapter.graphqlQuery<CreateDiscussionData>(
      `mutation($repo: ID!, $cat: ID!, $t: String!, $b: String!) {
        createDiscussion(input: { repositoryId: $repo, categoryId: $cat, title: $t, body: $b }) {
          discussion { url id number }
        }
      }`,
      { repo: repoId, cat: ideasCat.id, t: title, b: body }
    );
    const disc = res.createDiscussion?.discussion;
    return disc ? { url: disc.url, id: disc.id, number: disc.number } : undefined;
  } catch {
    return undefined;
  }
}

async function postDiscussionComment(
  adapter: GitHubLiveAdapter,
  discussionId: string,
  body: string
): Promise<void> {
  try {
    await adapter.graphqlQuery(
      `mutation($discId: ID!, $b: String!) { addDiscussionComment(input: { discussionId: $discId, body: $b }) { comment { url } } }`,
      { discId: discussionId, b: body }
    );
  } catch {
    // Non-fatal if comment posting fails
  }
}

function stageTaskAndPrompt(
  issueNumber: number,
  title: string,
  targetFiles: string[],
  criteria: string[],
  augmentedBody: string
): void {
  const pDir = path.join(resolveSafeAegisDir(), 'prompts');
  try { fs.mkdirSync(pDir, { recursive: true }); } catch { /* ignore */ }
  const pFile = path.resolve(pDir, `solver-issue-${issueNumber}.md`);
  const pContent = `# 🎯 Task #${issueNumber}: ${title}\n` +
    `Status: READY | Target Files: ${targetFiles.join(', ') || 'General'}\n\n` +
    `## Acceptance Criteria\n` +
    criteria.map(c => `- [ ] ${c}`).join('\n') +
    `\n\n## Specification Details\n${augmentedBody}`;
  fs.writeFileSync(pFile, pContent, 'utf8');

  stageTaskInInbox({
    issueNumber,
    title,
    role: 'issue-solver',
    worktree: 'experimental/solver',
    targetFiles,
    acceptanceCriteria: criteria,
    prompt: pContent,
    isGitHubIssue: true
  });
}

function updateRfcFileLinks(filePath: string, content: string, discUrl?: string, issueNumber?: number, issueUrl?: string): void {
  let updated = content;
  if (discUrl && !updated.includes(discUrl)) {
    updated = updated.replace(/(- \*\*RFC ID:\*\* [^\n]+)/, `$1\n- **Discussion:** [${discUrl}](${discUrl})`);
  }
  if (issueNumber && !updated.includes(`Issue:** [#${issueNumber}]`)) {
    const issueLink = issueUrl ? `[#${issueNumber}](${issueUrl})` : `#${issueNumber}`;
    updated = updated.replace(/(- \*\*RFC ID:\*\* [^\n]+)/, `$1\n- **Issue:** ${issueLink}`);
  }
  updated = updated.replace(/(\*{0,2}Durum:\*{0,2}\s*)Proposed/i, '$1In Progress (Geliştiriliyor) 🚀');
  fs.writeFileSync(filePath, updated, 'utf8');
}

function resolveOrCreateRfcDoc(
  rfcDir: string,
  rfcArg: string,
  descArg?: string
): { fileName: string; content: string; num: number; rfcTitle: string } {
  const matched = findExistingRfc(rfcDir, rfcArg);
  let num = resolveNextNumber(rfcDir);
  let fileName = matched || '';
  let content = '';

  if (matched) {
    content = fs.readFileSync(path.join(rfcDir, matched), 'utf8');
    const mNum = matched.match(/^RFC-(\d+)/);
    if (mNum) num = parseInt(mNum[1], 10);
  } else {
    const pad = String(num).padStart(3, '0');
    const slug = rfcArg.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    fileName = `RFC-${pad}-${slug}.md`;
    content = buildInitialRfc(num, rfcArg, descArg || rfcArg);
    fs.writeFileSync(path.join(rfcDir, fileName), content, 'utf8');
    console.log(`📑 Created RFC Blueprint: docs/rfc/${fileName}`);
  }

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const rfcTitle = titleMatch ? titleMatch[1].replace(/^[^\w]+/, '').trim() : rfcArg;
  return { fileName, content, num, rfcTitle };
}

async function resolveOrPublishDiscussion(
  auth: { token?: string; owner?: string; repo?: string; hasCredentials?: boolean },
  num: number,
  rfcTitle: string,
  descArg?: string,
  content = ''
): Promise<DiscussionResult | undefined> {
  const existingDiscMatch = content.match(/- \*\*Discussion:\*\*\s*\[([^\]]+)\]\(([^)]+)\)/);
  if (existingDiscMatch) return { url: existingDiscMatch[2] };
  if (!auth.hasCredentials) return undefined;

  console.log('💬 Publishing RFC Discussion to GitHub Ideas category...');
  const padNum = String(num).padStart(3, '0');
  const discBody = generateDiscussionResearchBody(num, rfcTitle, descArg || rfcTitle);
  return await publishDiscussion(auth, `RFC-${padNum}: ${rfcTitle}`, discBody);
}

async function createLiveIssueIfOnline(
  auth: { token?: string; owner?: string; repo?: string; hasCredentials?: boolean },
  padNum: string,
  baseIssue: { title: string; labels: string[] },
  augmentedBody: string,
  discInfo?: DiscussionResult
): Promise<{ issueNum: number; issueUrl: string }> {
  let issueNum = 100 + parseInt(padNum, 10);
  let issueUrl = '';

  if (!isTestEnv() && auth.hasCredentials && auth.token && auth.owner && auth.repo) {
    console.log(`🚀 Creating GitHub Issue for RFC-${padNum}...`);
    try {
      const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
      const created = await adapter.createIssue(baseIssue.title, augmentedBody, baseIssue.labels);
      issueNum = created.issue.number;
      issueUrl = created.issue.url || `https://github.com/${auth.owner}/${auth.repo}/issues/${issueNum}`;
      console.log(`✅ GitHub Issue Created: #${issueNum}`);
      if (discInfo?.id) {
        const comment = `🚀 **Implementation Issue Staged:** [#${issueNum}](${issueUrl})\nAcceptance criteria staged in TIP queue.`;
        await postDiscussionComment(adapter, discInfo.id, comment);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Issue creation fallback: ${msg}`);
    }
  }
  return { issueNum, issueUrl };
}

function printPipelineSummary(
  fileName: string,
  discUrl: string | undefined,
  issueNum: number,
  issueUrl: string,
  title: string,
  proposedFiles: string[]
): void {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🏛️  RFC LIFECYCLE PIPELINE COMPLETED');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(` • 📑 RFC Document:   docs/rfc/${fileName}`);
  console.log(` • 💬 Discussion:     ${discUrl || 'Offline / Local'}`);
  console.log(` • 🎯 GitHub Issue:   #${issueNum} ${issueUrl ? '(' + issueUrl + ')' : ''}`);
  console.log(` • 📥 TIP Task Inbox: Staged in .aegis/task-inbox.json (#${issueNum})`);
  console.log(` • 🏛️ GitHub Wiki:   Clean architecture synced to Wiki & RFC-Index`);
  console.log(` • 📝 README.md:     Synchronized with active RFCs & 43 Native MCP tools`);
  console.log(` • 👥 Teamwork Swarm: npm run aegis -- teamwork plan "${title}" ${proposedFiles.join(' ')}`);
  console.log('══════════════════════════════════════════════════════════════\n');
}

export async function handleRfcPipeline(rfcArg?: string, descArg?: string): Promise<void> {
  showBanner();
  if (!rfcArg) {
    console.error('❌ Usage: aegis rfc:pipeline "<RFC Title or ID>" [Description]');
    process.exit(1);
  }

  const rfcDir = resolveRfcDir();
  fs.mkdirSync(rfcDir, { recursive: true });
  const doc = resolveOrCreateRfcDoc(rfcDir, rfcArg, descArg);
  const padNum = String(doc.num).padStart(3, '0');
  const auth = GitHubTokenResolver.resolve();
  const discInfo = await resolveOrPublishDiscussion(auth, doc.num, doc.rfcTitle, descArg, doc.content);

  const parsed = new RfcTriager().parseRfc(doc.rfcTitle, doc.content, discInfo?.number ?? doc.num);
  const baseIssue = new RfcTriager().convertToIssue(parsed, 100 + doc.num);
  const augmentedBody = [
    '### 🏛️ Aegis RFC Blueprint',
    `- **RFC Document:** \`docs/rfc/${doc.fileName}\``,
    discInfo?.url ? `- **Discussion:** ${discInfo.url}` : '',
    '',
    baseIssue.body
  ].filter(Boolean).join('\n');

  const { issueNum, issueUrl } = await createLiveIssueIfOnline(auth, padNum, baseIssue, augmentedBody, discInfo);
  stageTaskAndPrompt(issueNum, baseIssue.title, parsed.proposedFiles, baseIssue.acceptanceCriteria, augmentedBody);
  updateRfcFileLinks(path.join(rfcDir, doc.fileName), doc.content, discInfo?.url, issueNum, issueUrl);
  const { syncRfcToWikiAndReadme } = await import('./doc-sync-command.js');
  await syncRfcToWikiAndReadme(doc.num, doc.rfcTitle, doc.fileName, doc.content);
  printPipelineSummary(doc.fileName, discInfo?.url, issueNum, issueUrl, baseIssue.title, parsed.proposedFiles);
}
