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
import {
  handleGodot,
  handleGodotInit,
  handleGodotInspect,
  handleGodotStatus,
  handleGodotValidate,
  handleGodotQuery,
  handleGodotRun,
  handleGodotDoctool,
  handleGodotPlaytest
} from '../commands/godot-command.js';
import { notifyDashboardFocus } from '../commands/focus-notifier.js';
import { handleFind } from '../commands/find-command.js';
import { handleTriage } from '../commands/triage-command.js';
import { handleTrace } from '../commands/trace-command.js';
import { handleGraphScan } from '../commands/graph-command.js';

const HELP_LINES: readonly string[] = [
  'Commands:',
  '  aegis init                             Initialize worktrees and environment',
  '  aegis status                           View worktrees and active file locks',
  '  aegis auto                             Run autonomous task queue & dispatcher',
  '  aegis prompt [role|id] [id]         Compile surgical AST prompt caching context',
  '  aegis contribute <issue> [agent]       Prepare isolated worktree & prompt for contribution',
  '  aegis rfc:triage "<title>" [body]      Triage RFC discussion into actionable issue criteria',
  '  aegis rfc:create "<title>" [desc]      Create architectural RFC, publish Wiki & GitHub Discussion',
  '  aegis rfc:decompose <rfcId>            Decompose accepted RFC into atomic GitHub Issues',
  '  aegis nlm:sync                         Export and synchronize architecture with NotebookLM',
  '  aegis nlm:query "<question>" [id]      Query Google NotebookLM with live citations',
  '  aegis nlm:research "<topic>" [mode]    Run automated NotebookLM research and stage in Wiki',
  '  aegis gh:locate [domain]               Resolve authoritative GitHub & Research locations',
  '  aegis project:list [owner]             List GitHub Projects v2 boards',
  '  aegis project:sync <proj> <issue> [st] Map and sync issue to Projects v2 column',
  '  aegis wiki:list                        List living memory pages directly from GitHub Wiki',
  '  aegis wiki:show <slug>                 Display page content directly from GitHub Wiki',
  '  aegis wiki:seed                        Seed 8-page living architecture suite into Wiki cache',
  '  aegis wiki:sync                        Sync/pull directly from GitHub Wiki remote repo',
  '  aegis wiki:status                      Inspect GitHub Wiki remote git availability',
  '  aegis merge <solver|qa|docs|ui> [branch] 4-step atomic merge & sibling synchronization',
  '  aegis dashboard [port]                 Launch Aegis Command Center web dashboard',
  '  aegis ide:list                         List supported IDEs and Multi-Agent capability matrix',
  '  aegis ide:sync                         Synchronize MCP servers & Skills across all IDEs',
  '  aegis gh:status [token]                Inspect live GitHub authentication & limits',
  '  aegis gh:sync [token]                  Sync live issues & dispatch to agents',
  '  aegis gh:comment <num> <msg> [token]   Post comment to GitHub issue',
  '  aegis gh:pr <head> <base> <title> <body> Create GitHub pull request',
  '  aegis godot [subcmd]                   Godot Bridge: init, status, inspect, query, doctool, validate',
  '  aegis inspect                          Run zero-token BoundingBox UI inspection',
  '  aegis mutate [filepath]                Run Mutation Testing gate evaluation',
  '  aegis estimate <files> <tests>         Compute adaptive timeout for build/test',
  '  aegis verify <filepath>                Run deterministic Iron Cage validation',
  '  aegis skeleton <filepath>              Generate token-saving AST Skeleton Map',
  '  aegis skeleton:scan [dir]              Scan project and compute total token savings',
  '  aegis cage:check [dir]                 Run Demir Kafes audit across all project code',
  '  aegis diff <diff>                      Validate surgical unified diff compliance',
  '  aegis audit <files>                    Run Immutable Oracle trust verification',
  '  aegis find <symbol>                    Fast AST symbol lookup and precision surgical slice',
  '  aegis triage [dir]                     Run Evidence-Based Bug Triage (zero false-alarm bugs)',
  '  aegis trace <target>                   Trace relational callers, signal listeners & scenes',
  '  aegis graph:scan [dir]                 Build cross-reference relational knowledge graph'
];

function handleHelp(): void {
  showBanner();
  console.log(HELP_LINES.join('\n'));
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
  godot: (a) => handleGodot(a.slice(1)),
  'godot:init': (a) => handleGodotInit(a[1], a[2]),
  'godot:status': () => handleGodotStatus(),
  'godot:inspect': (a) => handleGodotInspect(a[1]),
  'godot:validate': (a) => handleGodotValidate(a[1]),
  'godot:query': (a) => handleGodotQuery(a[1]),
  'godot:run': (a) => handleGodotRun(a[1], ...a.slice(2)),
  'godot:doctool': () => handleGodotDoctool(),
  'godot:playtest': (a) => handleGodotPlaytest(a[1]),
  inspect: (a) => handleInspect(a[1]),
  mutate: (a) => handleMutate(a[1]),
  estimate: (a) => handleEstimate(a),
  verify: (a) => handleVerify(a[1]),
  'cage:check': (a) => handleCageCheck(a[1]),
  skeleton: (a) => handleSkeleton(a[1]),
  'skeleton:scan': (a) => handleSkeletonScan(a[1]),
  diff: (a) => handleDiff(a.length > 2 ? a.slice(1).join(' ') : a[1]),
  audit: (a) => handleAudit(a[1]),
  find: (a) => handleFind(a[1]),
  triage: (a) => handleTriage(a[1]),
  trace: (a) => handleTrace(a[1]),
  'graph:scan': (a) => handleGraphScan(a[1])
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
