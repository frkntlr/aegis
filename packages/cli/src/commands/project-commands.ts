import {
  GitHubProjectsAdapter,
  WikiMemoryManager,
  GitHubTokenResolver,
  GitHubContextRouter,
  GitHubDomain
} from '@aegis/github-live';
import { showBanner } from './banner.js';

export async function handleProjectList(ownerArg?: string): Promise<void> {
  showBanner();
  console.log('📋 Fetching live GitHub Projects (v2)...');
  const auth = GitHubTokenResolver.resolve();
  const owner = ownerArg || auth.owner || 'frkntlr';

  try {
    const adapter = new GitHubProjectsAdapter({ token: auth.token, owner });
    const projects = await adapter.listProjects(owner);
    console.log(`\nFound ${projects.length} Project(s) for @${owner}:`);
    for (const p of projects) {
      const state = p.closed ? 'CLOSED' : 'OPEN';
      console.log(` • [#${p.number}] ${p.title} (${state})\n   ID: ${p.id}\n   URL: ${p.url}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to list projects: ${msg}`);
  }
}

export async function handleProjectSync(
  projectNumStr: string,
  issueNumStr: string,
  statusArg = 'in_progress',
  ownerArg?: string
): Promise<void> {
  showBanner();
  const pNum = parseInt(projectNumStr, 10);
  const iNum = parseInt(issueNumStr, 10);
  if (isNaN(pNum) || isNaN(iNum)) {
    console.error('❌ Usage: aegis project:sync <projectNumber> <issueNumber> [ready|in_progress|done]');
    process.exit(1);
  }

  const normalizedStatus = (statusArg === 'done' ? 'done' : statusArg === 'ready' ? 'ready' : 'in_progress') as 'ready' | 'in_progress' | 'done';
  const auth = GitHubTokenResolver.resolve();
  const owner = ownerArg || auth.owner || 'frkntlr';
  console.log(`🔄 Syncing Issue #${iNum} to Project #${pNum} [Column: ${normalizedStatus.toUpperCase()}]...`);

  try {
    const adapter = new GitHubProjectsAdapter({ token: auth.token, owner });
    const result = await adapter.syncIssue(pNum, iNum, normalizedStatus);
    console.log(`✅ Issue #${iNum} successfully mapped in Project #${pNum}!\n • Item ID: ${result.itemId}\n • Column:  ${result.status}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Project sync failed: ${msg}`);
  }
}

export function handleWikiList(): void {
  showBanner();
  console.log('📖 Fetching Living Memory directly from GitHub Wiki...');
  const manager = new WikiMemoryManager();
  const status = manager.checkStatus();
  console.log(` • Remote Repo: ${status.remoteRepo}\n • Web URL:     ${status.url}\n • Online:      ${status.available ? 'CONNECTED ✅' : 'PENDING INIT ⏳'}`);

  const pages = manager.listPages();
  console.log(`\nFound ${pages.length} living memory page(s):`);
  for (const page of pages) {
    console.log(`\n📘 [${page.slug}] ${page.title}\n   Last Updated: ${page.lastUpdated}`);
    for (const bullet of page.threeBulletSummary) console.log(`   • ${bullet}`);
  }
}

export function handleWikiShow(slug: string): void {
  showBanner();
  if (!slug) {
    console.error('❌ Usage: aegis wiki:show <slug>');
    process.exit(1);
  }
  const manager = new WikiMemoryManager();
  const page = manager.getPage(slug);
  if (!page) {
    console.error(`❌ Wiki page '${slug}' not found in GitHub Wiki.`);
    return;
  }

  console.log(`📘 ${page.title} (${page.slug})\nLast Updated: ${page.lastUpdated}\n\nLiving Memory (Three Bullets):`);
  for (const b of page.threeBulletSummary) console.log(` • ${b}`);
  console.log('\n--- Content ---\n' + page.content);
}

export function handleWikiSync(): void {
  showBanner();
  console.log('🔄 Synchronizing directly with GitHub Wiki remote repository...');
  const manager = new WikiMemoryManager();
  const pulled = manager.syncLive();
  const pushed = manager.pushAllToRemote();
  if (pulled || pushed.success) {
    console.log(`✅ GitHub Wiki synchronized! Pages: ${manager.listPages().length}`);
  } else {
    console.log(`⚠️  Sync status: ${pushed.message}`);
  }
}

export function handleWikiSeed(): void {
  showBanner();
  console.log('🌱 Seeding living architecture suite into GitHub Wiki cache...');
  const manager = new WikiMemoryManager();
  const res = manager.seedSuite();
  console.log(`✅ Seeded ${res.created} living architecture page(s) into .aegis/wiki-cache:`);
  for (const slug of res.pages) {
    console.log(` • ${slug}`);
  }

  const status = manager.checkStatus();
  if (status.available) {
    console.log('\n🚀 Remote repository is online. Pushing all pages to GitHub Wiki...');
    const pushRes = manager.pushAllToRemote();
    console.log(pushRes.success ? `✅ ${pushRes.message}` : `⚠️  ${pushRes.message}`);
  } else {
    console.log('\n⏳ GitHub Wiki remote git repository is pending 1-click web initialization:');
    console.log(`👉 ${status.initializeUrl || status.url}`);
    console.log('   Once the first page is created on GitHub, run `aegis wiki:sync` to publish all 8 pages.');
  }
}

export function handleWikiStatus(): void {
  showBanner();
  const manager = new WikiMemoryManager();
  const status = manager.checkStatus();
  console.log('🌐 GitHub Wiki Remote Status:');
  console.log(` • Repository:     ${status.remoteRepo}`);
  console.log(` • Web URL:        ${status.url}`);
  console.log(` • Git Available:  ${status.available ? 'YES ✅' : 'NO (Needs 1-click init) ⏳'}`);
  console.log(` • Active Pages:   ${status.pageCount}`);
  if (status.initializeUrl) {
    console.log(` • Initialize:     ${status.initializeUrl}`);
  }
}

export function handleGhLocate(domainArg?: string): void {
  showBanner();
  const router = new GitHubContextRouter();
  if (!domainArg || domainArg === 'all') {
    console.log(router.describeSystemLocations());
    return;
  }

  const validDomains: GitHubDomain[] = ['wiki', 'projects', 'issues', 'discussions', 'code', 'research'];
  const domain = domainArg.toLowerCase() as GitHubDomain;
  if (!validDomains.includes(domain)) {
    console.error(`❌ Unknown domain: "${domainArg}". Valid domains: ${validDomains.join(', ')}, all`);
    process.exit(1);
  }

  const loc = router.getLocation(domain);
  console.log(`📍 Authoritative Location for [${loc.domain.toUpperCase()}]:`);
  console.log(` • Title:    ${loc.title}\n • URL:      ${loc.url}\n • Protocol: ${loc.accessProtocol.toUpperCase()}\n • Purpose:  ${loc.description}`);
}
