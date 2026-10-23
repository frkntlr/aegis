#!/usr/bin/env node

import { showBanner } from '../commands/banner.js';
import {
  handleInit,
  handleStatus,
  handleAuto,
  handleDashboard,
  handleMerge,
  handleIdeList,
  handleIdeSync
} from '../commands/core-commands.js';
import { handlePrompt } from '../commands/prompt-command.js';
import { handleContribute, handleRfcTriage, handleNlmSync } from '../commands/contribute-command.js';
import { handleRfcCreate, handleRfcDecompose } from '../commands/rfc-commands.js';
import {
  handleEstimate,
  handleVerify,
  handleSkeleton,
  handleDiff,
  handleInspect,
  handleMutate,
  handleAudit,
  handleCageCheck,
  handleSkeletonScan
} from '../commands/dev-commands.js';
import {
  handleGhStatus,
  handleGhSync,
  handleGhComment,
  handleGhPr
} from '../commands/github-commands.js';
import {
  handleProjectList,
  handleProjectSync,
  handleWikiList,
  handleWikiShow,
  handleWikiSync,
  handleWikiStatus,
  handleWikiSeed,
  handleGhLocate
} from '../commands/project-commands.js';
import { handleNlmQuery, handleNlmResearch } from '../commands/nlm-command.js';
import { notifyDashboardFocus } from '../commands/focus-notifier.js';

function handleHelp(): void {
  showBanner();
  console.log('Commands:');
  console.log('  aegis init                             Initialize worktrees and environment');
  console.log('  aegis status                           View worktrees and active file locks');
  console.log('  aegis auto                             Run autonomous task queue & dispatcher');
  console.log('  aegis prompt [role|id] [id]         Compile surgical AST prompt caching context');
  console.log('  aegis contribute <issue> [agent]       Prepare isolated worktree & prompt for contribution');
  console.log('  aegis rfc:triage "<title>" [body]      Triage RFC discussion into actionable issue criteria');
  console.log('  aegis rfc:create "<title>" [desc]      Create architectural RFC, publish Wiki & GitHub Discussion');
  console.log('  aegis rfc:decompose <rfcId>            Decompose accepted RFC into atomic GitHub Issues');
  console.log('  aegis nlm:sync                         Export and synchronize architecture with NotebookLM');
  console.log('  aegis nlm:query "<question>" [id]      Query Google NotebookLM with live citations');
  console.log('  aegis nlm:research "<topic>" [mode]    Run automated NotebookLM research and stage in Wiki');
  console.log('  aegis gh:locate [domain]               Resolve authoritative GitHub & Research locations');
  console.log('  aegis project:list [owner]             List GitHub Projects v2 boards');
  console.log('  aegis project:sync <proj> <issue> [st] Map and sync issue to Projects v2 column');
  console.log('  aegis wiki:list                        List living memory pages directly from GitHub Wiki');
  console.log('  aegis wiki:show <slug>                 Display page content directly from GitHub Wiki');
  console.log('  aegis wiki:seed                        Seed 8-page living architecture suite into Wiki cache');
  console.log('  aegis wiki:sync                        Sync/pull directly from GitHub Wiki remote repo');
  console.log('  aegis wiki:status                      Inspect GitHub Wiki remote git availability');
  console.log('  aegis merge <solver|qa|docs> [branch]  4-step atomic merge & sibling synchronization');
  console.log('  aegis dashboard [port]                 Launch Aegis Command Center web dashboard');
  console.log('  aegis ide:list                         List supported IDEs and Multi-Agent capability matrix');
  console.log('  aegis ide:sync                         Synchronize MCP servers & Skills across all IDEs');
  console.log('  aegis gh:status [token]                Inspect live GitHub authentication & limits');
  console.log('  aegis gh:sync [token]                  Sync live issues & dispatch to agents');
  console.log('  aegis gh:comment <num> <msg> [token]   Post comment to GitHub issue');
  console.log('  aegis gh:pr <head> <base> <title> <body> Create GitHub pull request');
  console.log('  aegis inspect                          Run zero-token BoundingBox UI inspection');
  console.log('  aegis mutate [filepath]                Run Mutation Testing gate evaluation');
  console.log('  aegis estimate <files> <tests>         Compute adaptive timeout for build/test');
  console.log('  aegis verify <filepath>                Run deterministic Iron Cage validation');
  console.log('  aegis skeleton <filepath>              Generate token-saving AST Skeleton Map');
  console.log('  aegis skeleton:scan [dir]              Scan project and compute total token savings');
  console.log('  aegis cage:check [dir]                 Run Demir Kafes audit across all project code');
  console.log('  aegis diff <diff>                      Validate surgical unified diff compliance');
  console.log('  aegis audit <files>                    Run Immutable Oracle trust verification');
}

const commandMap: Record<string, (args: string[]) => Promise<void> | void> = {
  init: () => handleInit(),
  status: () => handleStatus(),
  auto: () => handleAuto(),
  prompt: (a) => handlePrompt(a[1], a[2], a[3]),
  contribute: (a) => handleContribute(a[1], a[2]),
  'rfc:triage': (a) => handleRfcTriage(a[1], a[2]),
  'rfc:create': (a) => handleRfcCreate(a[1], a[2]),
  rfc: (a) => handleRfcCreate(a[1], a[2]),
  ideate: (a) => handleRfcCreate(a[1], a[2]),
  'rfc:decompose': (a) => handleRfcDecompose(a[1]),
  'nlm:sync': () => handleNlmSync(),
  'nlm:query': (a) => handleNlmQuery(a[1], a[2]),
  'nlm:research': (a) => handleNlmResearch(a[1], a[2], a[3]),
  'gh:locate': (a) => handleGhLocate(a[1]),
  'project:list': (a) => handleProjectList(a[1]),
  'project:sync': (a) => handleProjectSync(a[1], a[2], a[3], a[4]),
  'wiki:list': () => handleWikiList(),
  'wiki:show': (a) => handleWikiShow(a[1]),
  'wiki:seed': () => handleWikiSeed(),
  'wiki:sync': () => handleWikiSync(),
  'wiki:status': () => handleWikiStatus(),
  merge: (a) => handleMerge(a[1], a[2]),
  dashboard: (a) => handleDashboard(a[1]),
  'ide:list': () => handleIdeList(),
  'ide:sync': () => handleIdeSync(),
  'gh:status': (a) => handleGhStatus(a[1]),
  'gh:sync': (a) => handleGhSync(a[1]),
  'gh:comment': (a) => handleGhComment(a[1], a[2], a[3]),
  'gh:pr': (a) => handleGhPr(a[1], a[2], a[3], a[4], a[5]),
  inspect: (a) => handleInspect(a[1]),
  mutate: (a) => handleMutate(a[1]),
  estimate: (a) => handleEstimate(a),
  verify: (a) => handleVerify(a[1]),
  'cage:check': (a) => handleCageCheck(a[1]),
  skeleton: (a) => handleSkeleton(a[1]),
  'skeleton:scan': (a) => handleSkeletonScan(a[1]),
  diff: (a) => handleDiff(a.length > 2 ? a.slice(1).join(' ') : a[1]),
  audit: (a) => handleAudit(a[1])
};

function detectIdeaIntent(args: string[]): { isIdea: boolean; title: string; desc?: string } {
  if (args.length === 0) return { isIdea: false, title: '' };
  const first = args[0].toLowerCase();
  const rawJoin = args.join(' ');
  const ideaPrefixes = ['idea', 'fikir', 'oneri', 'öneri', 'rfc', 'feature', 'concept', 'propose'];

  if (ideaPrefixes.includes(first)) {
    const title = args[1] || 'New Architectural Proposal';
    const desc = args.slice(2).join(' ') || title;
    return { isIdea: true, title, desc };
  }

  const triggers = ['bir fikrim var', 'yeni fikir', 'yeni bir fikir', 'fikrim şu', 'şunu ekleyelim', 'we should add', 'how about'];
  for (const trigger of triggers) {
    if (rawJoin.toLowerCase().includes(trigger)) {
      const clean = rawJoin.replace(new RegExp(trigger, 'i'), '').trim().replace(/^[:,-]\s*/, '');
      return { isIdea: true, title: clean || 'New Architectural Idea', desc: rawJoin };
    }
  }

  if (args[0].includes(' ') || (args.length >= 3 && !args[0].startsWith('-'))) {
    return { isIdea: true, title: args[0], desc: args.slice(1).join(' ') || args[0] };
  }

  return { isIdea: false, title: '' };
}

async function main(): Promise<void> {
  notifyDashboardFocus();
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const handler = commandMap[command];

  if (handler) {
    await handler(args);
  } else {
    const idea = detectIdeaIntent(args);
    if (idea.isIdea) {
      console.log(`💡 Idea Intent Detected: "${idea.title}"`);
      console.log(`🚀 Routing directly to Aegis RFC & Ideation Pipeline...\n`);
      await handleRfcCreate(idea.title, idea.desc);
    } else {
      handleHelp();
    }
  }
}

main().catch(err => {
  console.error(`💥 Fatal Error:`, err);
  process.exit(1);
});
