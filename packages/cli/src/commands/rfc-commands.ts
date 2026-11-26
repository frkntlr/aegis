import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GitHubTokenResolver,
  WikiMemoryManager,
  RfcTriager
} from '@aegis/github-live';
import { showBanner } from './banner.js';
import {
  generateDiscussionResearchBody,
  cleanseExistingRfcForWiki
} from './rfc-templates.js';
import {
  slugifyRfcTitle,
  resolveRfcDir,
  resolveNextRfcNumber,
  generateRfcContent,
  findRfcFiles,
  publishDiscussion,
  dispatchLiveIssue
} from './rfc-github-helpers.js';

export async function handleRfcCreate(titleArg?: string, descArg?: string): Promise<void> {
  showBanner();
  if (!titleArg) {
    console.error('❌ Usage: aegis rfc:create "<RFC Title>" [Description]');
    process.exit(1);
  }

  const rfcDir = resolveRfcDir();
  fs.mkdirSync(rfcDir, { recursive: true });
  const num = resolveNextRfcNumber(rfcDir);
  const padNum = String(num).padStart(3, '0');
  const slug = `RFC-${padNum}-${slugifyRfcTitle(titleArg)}`;
  const md = generateRfcContent(num, titleArg, descArg || titleArg);
  fs.writeFileSync(path.join(rfcDir, `${slug}.md`), md, 'utf8');

  console.log(`📑 RFC Created Locally: docs/rfc/${slug}.md`);
  console.log('💬 Publishing Research & Ideation Discussion to GitHub Discussions (Ideas)...');

  const auth = GitHubTokenResolver.resolve();
  const discBody = generateDiscussionResearchBody(num, titleArg, descArg || titleArg);
  const url = await publishDiscussion(auth, `RFC-${padNum}: ${titleArg}`, discBody);
  console.log(url ? `✅ Discussion: ${url}` : 'ℹ️  Discussion skipped (disabled or no permission).');
  console.log(`ℹ️  Wiki documentation will be synthesized upon approval: aegis rfc:approve ${padNum}`);
}

export async function handleRfcApprove(rfcArg?: string): Promise<void> {
  showBanner();
  if (!rfcArg) {
    console.error('❌ Usage: aegis rfc:approve <rfcNumberOrSlug>');
    process.exit(1);
  }
  const rfcDir = resolveRfcDir();
  const files = findRfcFiles(rfcDir, rfcArg);
  if (files.length === 0) {
    console.error(`❌ RFC matching '${rfcArg}' not found in docs/rfc/`);
    process.exit(1);
  }

  const filePath = path.join(rfcDir, files[0]);
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to read RFC ${files[0]}: ${msg}`);
    process.exit(1);
  }
  content = content.replace(/(\*{0,2}Durum:\*{0,2}\s*)Proposed/i, '$1Approved (Onaylandı) ✅');
  fs.writeFileSync(filePath, content, 'utf8');

  const slug = files[0].replace(/\.md$/, '');
  const m = files[0].match(/^RFC-(\d+)/i);
  const num = m ? parseInt(m[1], 10) : 0;
  const { syncRfcToWikiAndReadme } = await import('./doc-sync-command.js');
  const sync = await syncRfcToWikiAndReadme(num, slug, files[0], content, true);

  console.log(`✅ RFC Approved: ${files[0]}`);
  console.log(sync.wikiPushed ? `🏛️ Clean System Architecture pushed to Wiki: ${slug}` : 'ℹ️  Wiki page cached locally');
  console.log(`📑 Dynamic RFC-Index & README updated (Active RFCs: ${sync.totalRfcs})`);
}

export async function handleWikiClean(rfcArg?: string): Promise<void> {
  showBanner();
  console.log('🧹 Synthesizing Clean-Room Authoritative Architecture for GitHub Wiki...');
  const rfcDir = resolveRfcDir();
  const files = findRfcFiles(rfcDir, rfcArg);
  if (files.length === 0) {
    console.log('ℹ️ No RFC files found to cleanse.');
    return;
  }

  const wiki = new WikiMemoryManager();
  let count = 0;
  for (const f of files) {
    let content = '';
    try {
      content = fs.readFileSync(path.join(rfcDir, f), 'utf8');
    } catch {
      continue;
    }
    const slug = f.replace(/\.md$/, '');
    const cleanDoc = cleanseExistingRfcForWiki(slug, content);
    wiki.setPage(slug, cleanDoc.title, cleanDoc.threeBullets, cleanDoc.cleanContent);
    count++;
  }

  const sync = wiki.pushAllToRemote();
  console.log(`✨ Cleansed ${count} RFC(s) into living system architecture.`);
  console.log(sync.success ? '✅ GitHub Wiki fully synchronized with clean architecture!' : `⚠️ Wiki sync: ${sync.message}`);
}

export async function handleRfcDecompose(rfcArg?: string): Promise<void> {
  showBanner();
  if (!rfcArg) {
    console.error('❌ Usage: aegis rfc:decompose <rfcNumberOrSlug>');
    process.exit(1);
  }

  const rfcDir = resolveRfcDir();
  const files = findRfcFiles(rfcDir, rfcArg);
  if (files.length === 0) {
    console.error(`❌ RFC matching '${rfcArg}' not found in docs/rfc/`);
    process.exit(1);
  }

  let content = '';
  try {
    content = fs.readFileSync(path.join(rfcDir, files[0]), 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to read RFC ${files[0]}: ${msg}`);
    process.exit(1);
  }
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
