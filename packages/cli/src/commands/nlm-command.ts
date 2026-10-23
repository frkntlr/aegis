import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NotebookLmResearchEngine, GitHubWikiLiveAdapter } from '@aegis/github-live';
import { showBanner } from './banner.js';

function resolveClientModulePath(): string {
  const localPath = path.resolve(process.cwd(), '..', 'notebooklm', 'notebooklm-mcp-server', 'dist', 'client.js');
  if (fs.existsSync(localPath)) return localPath;

  const appData = process.env.APPDATA || '';
  const globalPath = path.resolve(appData, 'npm', 'node_modules', 'notebooklm-mcp-server', 'dist', 'client.js');
  if (fs.existsSync(globalPath)) return globalPath;

  return localPath;
}

async function resolveNotebookId(client: any, notebookIdArg?: string): Promise<string> {
  if (notebookIdArg) return notebookIdArg;
  console.log('🔍 Resolving Aegis Notebook ID...');
  const notebooks = await client.listNotebooks();
  const aegisNb = notebooks.find((n: any) => n.title?.toLowerCase().includes('aegis'));
  const id = aegisNb ? aegisNb.id : '3767b1fc-5759-416d-b938-495b8138ccd7';
  console.log(` • Selected Notebook: "${aegisNb?.title || 'Aegis Architecture'}" (${id})`);
  return id;
}

export async function handleNlmQuery(questionArg?: string, notebookIdArg?: string): Promise<void> {
  showBanner();
  if (!questionArg) {
    console.error('❌ Usage: aegis nlm:query "<question>" [notebookId]');
    process.exit(1);
  }

  const modulePath = resolveClientModulePath();
  if (!fs.existsSync(modulePath)) {
    console.error(`❌ notebooklm-mcp-server client not found at ${modulePath}.`);
    console.error('💡 Please verify notebooklm-mcp-server is installed.');
    process.exit(1);
  }

  console.log(`🤖 Connecting to Google NotebookLM...`);
  try {
    const fileUrl = pathToFileURL(modulePath).href;
    const { NotebookLMClient } = await import(fileUrl);
    const client = new NotebookLMClient();
    const notebookId = await resolveNotebookId(client, notebookIdArg);

    console.log(`💬 Query: "${questionArg}"\n⏳ Synthesizing AI response with source ground truth...\n`);
    const result = await client.query(notebookId, questionArg);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(result.answer || result);
    console.log('═══════════════════════════════════════════════════════════════');
    if (result.citations && result.citations.length > 0) {
      console.log(`\n📚 Cited Sources (${result.citations.length}):`);
      for (const c of result.citations) console.log(` • [${c.sourceId}] ${c.title || 'Source reference'}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ NotebookLM Query Failed: ${msg}`);
  }
}

export async function handleNlmResearch(topicArg?: string, modeArg = 'fast', notebookIdArg?: string): Promise<void> {
  showBanner();
  if (!topicArg) {
    console.error('❌ Usage: aegis nlm:research "<topic>" [fast|deep] [notebookId]');
    process.exit(1);
  }

  const mode = modeArg === 'deep' ? 'deep' : 'fast';
  console.log(`🔬 Initiating ${mode.toUpperCase()} Research via Google NotebookLM on: "${topicArg}"...`);
  try {
    const engine = new NotebookLmResearchEngine(notebookIdArg || '3767b1fc-5759-416d-b938-495b8138ccd7');
    console.log('⏳ Gathering web sources and synthesizing architectural intelligence...');
    const report = await engine.conductResearch(topicArg, mode, notebookIdArg);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📑 RESEARCH REPORT: ${report.topic}`);
    console.log(` • Mode: ${report.mode.toUpperCase()} | Sources: ${report.sourcesCount}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(report.synthesis);
    console.log('\n🎯 Recommended Acceptance Criteria:');
    for (const c of report.recommendedCriteria) console.log(` - [ ] ${c}`);

    const wikiAdapter = new GitHubWikiLiveAdapter();
    const published = engine.publishToWiki(wikiAdapter, report);
    if (published) {
      console.log('\n✅ Research report automatically pushed to GitHub Wiki!');
    } else {
      console.log('\n📘 Research staged in Living Memory (pending GitHub Wiki initialization).');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ NotebookLM Research Failed: ${msg}`);
  }
}
