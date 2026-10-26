/**
 * @file nlm-command.ts
 * CLI commands for Google NotebookLM integration and Unified Knowledge Oracle.
 * Zero-Chromium, worktree-resilient, 3-tier fallback support.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  UnifiedKnowledgeOracle,
  NotebookLmResearchEngine,
  GitHubWikiLiveAdapter,
  type OracleQueryOptions,
  type OracleQueryResult,
  type OracleTier
} from '@aegis/github-live';
import { showBanner } from './banner.js';

interface ParsedNlmOptions {
  question?: string;
  notebookId?: string;
  forceOffline: boolean;
  preferredTier?: OracleTier;
}

export function parseNlmArgs(args: string[]): ParsedNlmOptions {
  const filtered: string[] = [];
  let forceOffline = false;
  let preferredTier: OracleTier | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--offline' || a === '-o') {
      forceOffline = true;
    } else if (a === '--tier' && args[i + 1]) {
      preferredTier = args[i + 1] as OracleTier;
      i++;
    } else if (a.startsWith('--tier=')) {
      preferredTier = a.split('=')[1] as OracleTier;
    } else {
      filtered.push(a);
    }
  }

  const question = filtered[0];
  const notebookId = filtered[1] && !filtered[1].startsWith('-') ? filtered[1] : undefined;
  return { question, notebookId, forceOffline, preferredTier };
}

function printQueryResult(res: OracleQueryResult): void {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(res.answer);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n🔍 Source Tier: [${res.sourceTier.toUpperCase()}]`);

  if (res.authAlert) {
    console.log(`⚠️  Notice: ${res.authAlert}`);
  }

  if (res.citations.length > 0) {
    console.log(`\n📚 Cited Sources (${res.citations.length}):`);
    for (const c of res.citations) {
      console.log(` • [${c.sourceId}] ${c.title || 'Source reference'}`);
    }
  }
}

export async function handleNlmQuery(...rawArgs: string[]): Promise<void> {
  showBanner();
  const parsed = parseNlmArgs(rawArgs.filter(Boolean));

  if (!parsed.question) {
    console.error('❌ Usage: aegis nlm:query "<question>" [notebookId] [--offline] [--tier <nlm|context7|local_ast>]');
    process.exit(1);
  }

  console.log(`🤖 Consulting Unified Knowledge Oracle (Tier 1: NotebookLM -> Tier 2: Context7 -> Tier 3: Local AST)...`);
  console.log(`💬 Query: "${parsed.question}"\n⏳ Synthesizing verified response...\n`);

  try {
    const oracle = new UnifiedKnowledgeOracle();
    const queryOpts: OracleQueryOptions = {
      notebookId: parsed.notebookId,
      forceOffline: parsed.forceOffline,
      preferredTier: parsed.preferredTier
    };

    const result = await oracle.query(parsed.question, queryOpts);
    printQueryResult(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Unified Knowledge Query Failed: ${msg}`);
  }
}

export async function handleNlmResearch(topicArg?: string, modeArg = 'fast', notebookIdArg?: string): Promise<void> {
  showBanner();
  if (!topicArg) {
    console.error('❌ Usage: aegis nlm:research "<topic>" [fast|deep] [notebookId]');
    process.exit(1);
  }

  const mode = modeArg === 'deep' ? 'deep' : 'fast';
  console.log(`🔬 Initiating ${mode.toUpperCase()} Research via Unified Oracle on: "${topicArg}"...`);
  try {
    const engine = new NotebookLmResearchEngine(notebookIdArg || '3767b1fc-5759-416d-b938-495b8138ccd7');
    console.log('⏳ Gathering architectural intelligence and synthesizing report...');
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
    const pubMsg = published
      ? '\n✅ Research report automatically pushed to GitHub Wiki!'
      : '\n📘 Research staged in Living Memory (pending GitHub Wiki initialization).';
    console.log(pubMsg);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ NotebookLM Research Failed: ${msg}`);
  }
}
