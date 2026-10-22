import { GitHubProjectsAdapter, WikiMemoryManager, GitHubTokenResolver } from '@aegis/github-live';
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
      console.log(` • [#${p.number}] ${p.title} (${state})`);
      console.log(`   ID: ${p.id}`);
      console.log(`   URL: ${p.url}`);
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
    console.log(`✅ Issue #${iNum} successfully mapped in Project #${pNum}!`);
    console.log(` • Item ID: ${result.itemId}`);
    console.log(` • Column:  ${result.status}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Project sync failed: ${msg}`);
  }
}

export function handleWikiList(dirArg = '.aegis/wiki'): void {
  showBanner();
  console.log(`📖 Inspecting Living Memory Wiki Pages (${dirArg})...`);
  const manager = new WikiMemoryManager(dirArg);
  const pages = manager.listPages();

  console.log(`\nFound ${pages.length} living memory page(s):`);
  for (const page of pages) {
    console.log(`\n📘 [${page.slug}] ${page.title}`);
    console.log(`   Last Updated: ${page.lastUpdated}`);
    for (const bullet of page.threeBulletSummary) {
      console.log(`   • ${bullet}`);
    }
  }
}

export function handleWikiShow(slug: string, dirArg = '.aegis/wiki'): void {
  showBanner();
  if (!slug) {
    console.error('❌ Usage: aegis wiki:show <slug> [dir]');
    process.exit(1);
  }
  const manager = new WikiMemoryManager(dirArg);
  const page = manager.getPage(slug);
  if (!page) {
    console.error(`❌ Wiki page '${slug}' not found in ${dirArg}.`);
    return;
  }

  console.log(`📘 ${page.title} (${page.slug})`);
  console.log(`Last Updated: ${page.lastUpdated}\n`);
  console.log('Living Memory (Three Bullets):');
  for (const b of page.threeBulletSummary) console.log(` • ${b}`);
  console.log('\n--- Content ---');
  console.log(page.content);
}

export function handleWikiSync(outputDir = '.aegis/wiki'): void {
  showBanner();
  console.log(`💾 Syncing Living Memory to Disk (${outputDir})...`);
  const manager = new WikiMemoryManager(outputDir);
  const exported = manager.exportAll(outputDir);
  console.log(`✅ Successfully exported ${exported.length} living memory page(s):`);
  for (const p of exported) {
    console.log(` • ${p}`);
  }
}
