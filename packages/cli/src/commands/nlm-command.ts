/**
 * @file nlm-command.ts
 * CLI commands for Google NotebookLM integration, Deep Research, Sources & Pruning.
 * Zero-Chromium, worktree-resilient, 5-shield protected.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  UnifiedKnowledgeOracle,
  NotebookLmResearchEngine,
  NotebookLmNativeClient,
  NotebookLmDeepResearchWorkflow,
  SourceFreshnessAuditor,
  SourceTombstonePruner,
  GitHubWikiLiveAdapter,
  type OracleQueryOptions,
  type OracleQueryResult,
  type OracleTier
} from '@aegis/github-live';
import { showBanner } from './banner.js';
import { handleNlmAuth, promptInteractiveAuthResolution } from './nlm-auth-helper.js';
import { handleNlmSwitch } from './nlm-switch-helper.js';

export { handleNlmAuth, handleNlmSwitch, promptInteractiveAuthResolution };

const DEFAULT_NOTEBOOK_ID = '3767b1fc-5759-416d-b938-495b8138ccd7';

export function parseNlmArgs(args: string[]): {
  question?: string;
  notebookId?: string;
  forceOffline: boolean;
  preferredTier?: OracleTier;
} {
  const filtered: string[] = [];
  let forceOffline = false;
  let preferredTier: OracleTier | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--offline' || a === '-o') {
      forceOffline = true;
    } else if (a === '--tier' && args[i + 1]) {
      preferredTier = args[++i] as OracleTier;
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

  if (res.authAlert) console.log(`⚠️  Notice: ${res.authAlert}`);
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
  try {
    const oracle = new UnifiedKnowledgeOracle();
    const queryOpts: OracleQueryOptions = {
      notebookId: parsed.notebookId,
      forceOffline: parsed.forceOffline,
      preferredTier: parsed.preferredTier,
      onAuthChallenge: promptInteractiveAuthResolution
    };
    const result = await oracle.query(parsed.question, queryOpts);
    printQueryResult(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Unified Knowledge Query Failed: ${msg}`);
  }
}

export async function handleNlmResearch(...args: string[]): Promise<void> {
  showBanner();
  const filtered = args.filter(a => a && !a.startsWith('-'));
  const topic = filtered[0];
  if (!topic) {
    console.error('❌ Usage: aegis nlm:research "<topic>" [--deep] [--detach] [--import] [notebookId]');
    process.exit(1);
  }

  const isDeep = args.includes('--deep') || filtered[1] === 'deep';
  const isDetach = args.includes('--detach');
  const doImport = args.includes('--import') || args.includes('--ingest');
  const notebookId = filtered.find(a => a !== topic && a !== 'deep' && a !== 'fast') || DEFAULT_NOTEBOOK_ID;

  if (isDeep) {
    await runDeepResearch(notebookId, topic, isDetach, doImport);
  } else {
    await runFastResearch(notebookId, topic);
  }
}

async function runDeepResearch(nbId: string, topic: string, detach: boolean, doImport: boolean): Promise<void> {
  console.log(`🔬 Initiating DEEP Research via Google NotebookLM on: "${topic}"...`);
  try {
    const workflow = new NotebookLmDeepResearchWorkflow();
    const res = await workflow.execute(nbId, topic, {
      detach,
      ingestMode: doImport ? 'digest' : 'none'
    });

    if (detach) {
      console.log(`🚀 Deep Research running in background!\n • Task ID: ${res.taskId}`);
      console.log(`💡 Check status: aegis nlm:poll ${res.taskId}\n💡 Ingest when ready: aegis nlm:import ${res.taskId}`);
      return;
    }

    console.log(`\n═══════════════════════════════════════════════════════════════\n${res.synthesis}\n═══════════════════════════════════════════════════════════════`);
    if (res.ingestedSourceId) console.log(`\n✅ Research Digest ingested into Notebook (Source ID: ${res.ingestedSourceId})`);
    if (res.quotaWarning) console.log(`\n⚠️  Quota Warning: Notebook has ${res.sourceCount}/50 sources. Consider running: aegis nlm:prune`);
  } catch (err: unknown) {
    console.error(`❌ Deep Research Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runFastResearch(nbId: string, topic: string): Promise<void> {
  console.log(`🔬 Initiating FAST Research via Unified Oracle on: "${topic}"...`);
  try {
    const engine = new NotebookLmResearchEngine(nbId);
    const report = await engine.conductResearch(topic, 'fast', nbId);
    console.log(`\n═══════════════════════════════════════════════════════════════\n📑 RESEARCH REPORT: ${report.topic} (${report.sourcesCount} sources)\n═══════════════════════════════════════════════════════════════\n${report.synthesis}`);
    if (report.recommendedCriteria && report.recommendedCriteria.length > 0) {
      console.log('\n🎯 Recommended Acceptance Criteria:');
      for (const c of report.recommendedCriteria) console.log(` • ${c}`);
    }
    const wikiAdapter = new GitHubWikiLiveAdapter();
    const pub = engine.publishToWiki(wikiAdapter, report);
    console.log(pub ? '\n✅ Report pushed to GitHub Wiki!' : '\n📘 Report staged in Living Memory.');
  } catch (err: unknown) {
    console.error(`❌ Research Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handleNlmSources(notebookIdArg?: string): Promise<void> {
  showBanner();
  const nbId = notebookIdArg || DEFAULT_NOTEBOOK_ID;
  console.log(`📚 Inspecting sources in Notebook [${nbId}]...`);
  try {
    const client = new NotebookLmNativeClient();
    const auditor = new SourceFreshnessAuditor();
    const sources = await client.listSources(nbId);
    const audited = auditor.auditSources(sources);

    console.log(`\n📋 Total Sources: ${sources.length} / 50`);
    for (const s of audited) {
      const tag = s.isPinned ? '[PINNED]' : (s.isStale ? `[STALE: ${s.reason}]` : '[ACTIVE]');
      console.log(` • ${tag} [${s.sourceId}] ${s.title}`);
    }
  } catch (err: unknown) {
    console.error(`❌ Failed to list sources: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handleNlmPoll(taskIdArg?: string, notebookIdArg?: string): Promise<void> {
  showBanner();
  if (!taskIdArg) {
    console.error('❌ Usage: aegis nlm:poll <taskId> [notebookId]');
    process.exit(1);
  }
  const nbId = notebookIdArg || DEFAULT_NOTEBOOK_ID;
  try {
    const workflow = new NotebookLmDeepResearchWorkflow();
    const poll = await workflow.poll(nbId, taskIdArg);
    console.log(`📊 Research Task: ${taskIdArg} | Status: [${poll.status}] | Discovered: ${poll.sources.length} sources`);
    if (poll.synthesis) console.log(`\nSynthesis preview:\n${poll.synthesis.slice(0, 300)}...`);
  } catch (err: unknown) {
    console.error(`❌ Poll Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handleNlmImport(taskIdArg?: string, notebookIdArg?: string): Promise<void> {
  showBanner();
  if (!taskIdArg) {
    console.error('❌ Usage: aegis nlm:import <taskId> [notebookId]');
    process.exit(1);
  }
  const nbId = notebookIdArg || DEFAULT_NOTEBOOK_ID;
  try {
    const workflow = new NotebookLmDeepResearchWorkflow();
    const poll = await workflow.poll(nbId, taskIdArg);
    const client = new NotebookLmNativeClient();
    const digest = NotebookLmDeepResearchWorkflow.formatDigest(taskIdArg, poll);
    const added = await client.addTextSource(nbId, `Research Digest: ${taskIdArg}`, digest);
    console.log(`✅ Ingested Synthesized Digest (Source ID: ${added.sourceId})`);
  } catch (err: unknown) {
    console.error(`❌ Import Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handleNlmPrune(...args: string[]): Promise<void> {
  showBanner();
  const force = args.includes('--force') || args.includes('-f');
  const nbId = args.find(a => !a.startsWith('-')) || DEFAULT_NOTEBOOK_ID;

  console.log(`🧹 Running Tombstone Pruner on Notebook [${nbId}] (${force ? 'PHYSICAL DELETE' : 'DRY-RUN'})...`);
  try {
    const pruner = new SourceTombstonePruner();
    const res = await pruner.prune(nbId, { force });
    if (res.dryRun) {
      console.log(`\n🔍 [DRY-RUN] Found ${res.candidates.length} candidate(s) for pruning (run with --force to delete):`);
      for (const c of res.candidates) console.log(` • [${c.sourceId}] ${c.title} (Reason: ${c.reason})`);
    } else {
      console.log(`\n✅ Pruning Complete: ${res.pruned.length} stale source(s) deleted permanently.`);
    }
  } catch (err: unknown) {
    console.error(`❌ Prune Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
