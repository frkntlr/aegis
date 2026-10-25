import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GitHubTokenResolver,
  GitHubLiveAdapter,
  WikiMemoryManager,
  RfcTriager
} from '@aegis/github-live';
import { showBanner } from './banner.js';
import {
  generateDiscussionResearchBody,
  cleanseExistingRfcForWiki
} from './rfc-templates.js';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

function resolveNextRfcNumber(rfcDir: string): number {
  if (!fs.existsSync(rfcDir)) return 1;
  const files = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
  if (files.length === 0) return 1;
  const numbers = files.map(f => {
    const m = f.match(/^RFC-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return Math.max(...numbers, 0) + 1;
}

function generateRfcContent(num: number, title: string, desc: string): string {
  const pad = String(num).padStart(3, '0');
  return [
    `# 🏛️ RFC-${pad}: ${title}`,
    '### Aegis Autonomous Architecture Blueprint',
    '',
    `- **RFC ID:** RFC-${pad} | **Durum:** Proposed | **Tarih:** ${new Date().toISOString().split('T')[0]}`,
    '',
    '## 🔍 1. Fikir ve Problem Tanımı',
    desc || title,
    '',
    '## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)',
    '1. **Core Controller:** Durum yönetimi ve ana mantık akışı.',
    '2. **Event Bus & Sinyaller:** Bileşenler arası gevşek bağlılık.',
    '3. **UI / HUD Katmanı:** Görsel geri bildirim.',
    '',
    '## 🔒 3. Demir Kafes Standartları',
    '- Azami 300 satır/dosya, azami 40 satır/fonksiyon.',
    '',
    '## 🎯 4. Kabul Kriterleri (Acceptance Criteria)',
    '- [ ] Çekirdek mantık ve veri modeli tasarımı tamamlandı.',
    '- [ ] Demir Kafes (300 satır / 40 satır) AST doğrulaması sağlandı.',
    '- [ ] Birim testler ve mutasyon testi onayından (%100 Kill Score) geçti.'
  ].join('\n');
}

interface RepoDiscussionData {
  repository?: {
    id: string;
    discussionCategories?: {
      nodes: Array<{ id: string; name: string }>;
    };
  };
}

interface CreateDiscussionData {
  createDiscussion?: {
    discussion?: {
      url: string;
    };
  };
}

async function publishDiscussion(auth: { token?: string; owner?: string; repo?: string }, title: string, body: string): Promise<string | undefined> {
  if (!auth.token || !auth.owner || !auth.repo) return undefined;
  const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
  try {
    const repoData = await adapter.graphqlQuery<RepoDiscussionData>(
      `query($o: String!, $r: String!) { repository(owner: $o, name: $r) { id discussionCategories(first: 10) { nodes { id name } } } }`,
      { o: auth.owner, r: auth.repo }
    );
    const repoId = repoData.repository?.id;
    const cats = repoData.repository?.discussionCategories?.nodes || [];
    const ideasCat = cats.find((c: { name: string }) => c.name.toLowerCase() === 'ideas') || cats[0];
    if (!repoId || !ideasCat) return undefined;

    const res = await adapter.graphqlQuery<CreateDiscussionData>(
      `mutation($repo: ID!, $cat: ID!, $t: String!, $b: String!) {
        createDiscussion(input: { repositoryId: $repo, categoryId: $cat, title: $t, body: $b }) { discussion { url } }
      }`,
      { repo: repoId, cat: ideasCat.id, t: title, b: body }
    );
    return res.createDiscussion?.discussion?.url;
  } catch {
    return undefined;
  }
}

export async function handleRfcCreate(titleArg?: string, descArg?: string): Promise<void> {
  showBanner();
  if (!titleArg) {
    console.error('❌ Usage: aegis rfc:create "<RFC Title>" [Description]');
    process.exit(1);
  }

  const rfcDir = path.resolve(process.cwd(), 'docs', 'rfc');
  fs.mkdirSync(rfcDir, { recursive: true });
  const num = resolveNextRfcNumber(rfcDir);
  const padNum = String(num).padStart(3, '0');
  const slug = `RFC-${padNum}-${slugify(titleArg)}`;
  const md = generateRfcContent(num, titleArg, descArg || titleArg);
  fs.writeFileSync(path.join(rfcDir, `${slug}.md`), md, 'utf8');

  console.log(`📑 RFC Created Locally: docs/rfc/${slug}.md`);
  console.log('💬 Publishing Research & Ideation Discussion to GitHub Discussions (Ideas)...');

  const auth = GitHubTokenResolver.resolve();
  const discBody = generateDiscussionResearchBody(num, titleArg, descArg || titleArg);
  const url = await publishDiscussion(auth, `RFC-${padNum}: ${titleArg}`, discBody);
  console.log(url ? `✅ Discussion: ${url}` : 'ℹ️  Discussion skipped (disabled or no permission).');
  console.log('ℹ️  Wiki documentation will be synthesized upon approval: aegis rfc:approve ' + padNum);
}

function findRfcFiles(rfcDir: string, filterArg?: string): string[] {
  if (!fs.existsSync(rfcDir)) return [];
  const all = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
  if (!filterArg) return all;
  return all.filter(f => f.toLowerCase().includes(filterArg.toLowerCase()));
}

export async function handleRfcApprove(rfcArg?: string): Promise<void> {
  showBanner();
  if (!rfcArg) {
    console.error('❌ Usage: aegis rfc:approve <rfcNumberOrSlug>');
    process.exit(1);
  }
  const rfcDir = path.resolve(process.cwd(), 'docs', 'rfc');
  const files = findRfcFiles(rfcDir, rfcArg);
  if (files.length === 0) {
    console.error(`❌ RFC matching '${rfcArg}' not found in docs/rfc/`);
    process.exit(1);
  }

  const filePath = path.join(rfcDir, files[0]);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/Durum:\s*Proposed/i, 'Durum: Approved (Onaylandı) ✅');
  fs.writeFileSync(filePath, content, 'utf8');

  const slug = files[0].replace(/\.md$/, '');
  const cleanDoc = cleanseExistingRfcForWiki(slug, content);
  const wiki = new WikiMemoryManager();
  wiki.setPage(slug, cleanDoc.title, cleanDoc.threeBullets, cleanDoc.cleanContent);
  const sync = wiki.pushAllToRemote();

  console.log(`✅ RFC Approved: ${files[0]}`);
  console.log(sync.success ? `🏛️ Clean System Architecture pushed to Wiki: ${slug}` : `⚠️ Wiki push: ${sync.message}`);
}

export async function handleWikiClean(rfcArg?: string): Promise<void> {
  showBanner();
  console.log('🧹 Synthesizing Clean-Room Authoritative Architecture for GitHub Wiki...');
  const rfcDir = path.resolve(process.cwd(), 'docs', 'rfc');
  const files = findRfcFiles(rfcDir, rfcArg);
  if (files.length === 0) {
    console.log('ℹ️ No RFC files found to cleanse.');
    return;
  }

  const wiki = new WikiMemoryManager();
  let count = 0;
  for (const f of files) {
    const content = fs.readFileSync(path.join(rfcDir, f), 'utf8');
    const slug = f.replace(/\.md$/, '');
    const cleanDoc = cleanseExistingRfcForWiki(slug, content);
    wiki.setPage(slug, cleanDoc.title, cleanDoc.threeBullets, cleanDoc.cleanContent);
    count++;
  }

  const sync = wiki.pushAllToRemote();
  console.log(`✨ Cleansed ${count} RFC(s) into living system architecture.`);
  console.log(sync.success ? '✅ GitHub Wiki fully synchronized with clean architecture!' : `⚠️ Wiki sync: ${sync.message}`);
}

async function dispatchLiveIssue(
  auth: { hasCredentials?: boolean; token?: string; owner?: string; repo?: string },
  issue: { title: string; body: string; labels: string[] },
  fileSlug: string
): Promise<boolean> {
  if (!auth.hasCredentials || !auth.token || !auth.owner || !auth.repo) return false;
  const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
  console.log(`🚀 Creating GitHub Issue from ${fileSlug}...`);
  try {
    const created = await adapter.createIssue(issue.title, issue.body, issue.labels);
    console.log(`✅ GitHub Issue Created: #${created.issue.number} (${created.issue.url || created.issue.title})`);
    console.log(` • Labels: ${issue.labels.join(', ')}`);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`⚠️  Failed to create issue via API: ${msg}`);
    return false;
  }
}

export async function handleRfcDecompose(rfcArg?: string): Promise<void> {
  showBanner();
  if (!rfcArg) {
    console.error('❌ Usage: aegis rfc:decompose <rfcNumberOrSlug>');
    process.exit(1);
  }

  const rfcDir = path.resolve(process.cwd(), 'docs', 'rfc');
  const files = findRfcFiles(rfcDir, rfcArg);
  if (files.length === 0) {
    console.error(`❌ RFC matching '${rfcArg}' not found in docs/rfc/`);
    process.exit(1);
  }

  const content = fs.readFileSync(path.join(rfcDir, files[0]), 'utf8');
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const rfcTitle = titleMatch ? titleMatch[1].replace(/^[^\w]+/, '').trim() : files[0];
  const parsed = new RfcTriager().parseRfc(rfcTitle, content, 1);
  const issue = new RfcTriager().convertToIssue(parsed, 101);

  const auth = GitHubTokenResolver.resolve();
  const created = await dispatchLiveIssue(auth, issue, files[0]);
  if (!created) {
    console.log(`📋 Decomposed Issue Spec for ${files[0]}: ${issue.title} (Labels: ${issue.labels.join(', ')})`);
  }
}
