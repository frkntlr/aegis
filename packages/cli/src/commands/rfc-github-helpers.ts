import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubLiveAdapter } from '@aegis/github-live';

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

export function slugifyRfcTitle(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

export function resolveRfcDir(): string {
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

export function resolveNextRfcNumber(rfcDir: string): number {
  if (!fs.existsSync(rfcDir)) return 1;
  const files = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
  if (files.length === 0) return 1;
  const numbers = files.map(f => {
    const m = f.match(/^RFC-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return Math.max(...numbers, 0) + 1;
}

export function generateRfcContent(num: number, title: string, desc: string): string {
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

export function findRfcFiles(rfcDir: string, filterArg?: string): string[] {
  if (!fs.existsSync(rfcDir)) return [];
  const all = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
  if (!filterArg) return all;
  return all.filter(f => f.toLowerCase().includes(filterArg.toLowerCase()));
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.AEGIS_TEST) || Boolean(process.env.VITEST) || Boolean(process.env.NODE_TEST_CONTEXT);
}

export async function publishDiscussion(
  auth: { token?: string; owner?: string; repo?: string },
  title: string,
  body: string
): Promise<string | undefined> {
  if (isTestEnv() || !auth.token || !auth.owner || !auth.repo) return undefined;
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

export async function dispatchLiveIssue(
  auth: { hasCredentials?: boolean; token?: string; owner?: string; repo?: string },
  issue: { title: string; body: string; labels: string[] },
  fileSlug: string
): Promise<boolean> {
  if (isTestEnv() || !auth.hasCredentials || !auth.token || !auth.owner || !auth.repo) return false;
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
