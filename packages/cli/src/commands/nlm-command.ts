import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { showBanner } from './banner.js';

function resolveClientModulePath(): string {
  const localPath = path.resolve(process.cwd(), '..', 'notebooklm', 'notebooklm-mcp-server', 'dist', 'client.js');
  if (fs.existsSync(localPath)) return localPath;

  const appData = process.env.APPDATA || '';
  const globalPath = path.resolve(appData, 'npm', 'node_modules', 'notebooklm-mcp-server', 'dist', 'client.js');
  if (fs.existsSync(globalPath)) return globalPath;

  return localPath;
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

    let notebookId = notebookIdArg;
    if (!notebookId) {
      console.log('🔍 Resolving Aegis Notebook ID...');
      const notebooks = await client.listNotebooks();
      const aegisNb = notebooks.find((n: any) => n.title?.toLowerCase().includes('aegis'));
      notebookId = aegisNb ? aegisNb.id : '3767b1fc-5759-416d-b938-495b8138ccd7';
      console.log(` • Selected Notebook: "${aegisNb?.title || 'Aegis Architecture'}" (${notebookId})`);
    }

    console.log(`💬 Query: "${questionArg}"`);
    console.log('⏳ Synthesizing AI response with source ground truth...\n');
    const result = await client.query(notebookId, questionArg);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(result.answer || result);
    console.log('═══════════════════════════════════════════════════════════════');
    if (result.citations && result.citations.length > 0) {
      console.log(`\n📚 Cited Sources (${result.citations.length}):`);
      for (const c of result.citations) {
        console.log(` • [${c.sourceId}] ${c.title || 'Source reference'}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ NotebookLM Query Failed: ${msg}`);
  }
}
