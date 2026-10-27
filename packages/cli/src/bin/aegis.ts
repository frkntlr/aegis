#!/usr/bin/env node

import { showBanner } from '../commands/banner.js';
import {
  handleInit,
  handleStatus,
  handleAuto,
  handleDashboard,
  handleMerge,
  handleBranchSync,
  handleIdeList,
  handleIdeSync,
  handleLoopStatus,
  handleLoopReset
} from '../commands/core-commands.js';
import { handlePrompt } from '../commands/prompt-command.js';
import { handleContribute, handleRfcTriage, handleNlmSync } from '../commands/contribute-command.js';
import { handleRfcCreate, handleRfcDecompose, handleRfcApprove, handleWikiClean } from '../commands/rfc-commands.js';
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
import {
  handleNlmQuery,
  handleNlmResearch,
  handleNlmSources,
  handleNlmPoll,
  handleNlmImport,
  handleNlmPrune,
  handleNlmRestore,
  handleNlmAuth,
  handleNlmSwitch
} from '../commands/nlm-command.js';
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
import { handleAstSearch, handleAstReplace } from '../commands/ast-grep-command.js';
import { handleRtkCompress } from '../commands/rtk-command.js';
import { handleContext7Query } from '../commands/context7-command.js';
import { handleDepsDrift } from '../commands/deps-commands.js';
import { handleDebugCommand } from '../commands/debug-command.js';
import { startMcpServer } from '../commands/mcp-server-command.js';
import {
  handleMemoryQuery,
  handleMemoryStats,
  handleMemoryRefresh,
  handleMemoryWatch,
  handleMemoryPrune,
  handleMemoryVerify,
  handleMemoryColdStart
} from '../commands/memory-command.js';
import { FuzzyMatcher } from '@aegis/ast-skeleton';
import { ConversationalIntentDetector } from '@aegis/github-live';
import { HELP_LINES } from './help-text.js';

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
  'rfc:approve': (a) => handleRfcApprove(a[1]),
  rfc: (a) => handleRfcCreate(a[1], a[2]),
  ideate: (a) => handleRfcCreate(a[1], a[2]),
  'rfc:decompose': (a) => handleRfcDecompose(a[1]),
  'nlm:sync': () => handleNlmSync(),
  'nlm:query': (a) => handleNlmQuery(...a.slice(1)),
  'nlm:research': (a) => handleNlmResearch(...a.slice(1)),
  'nlm:sources': (a) => handleNlmSources(a[1]),
  'nlm:poll': (a) => handleNlmPoll(a[1], a[2]),
  'nlm:import': (a) => handleNlmImport(a[1], a[2]),
  'nlm:prune': (a) => handleNlmPrune(...a.slice(1)),
  'nlm:restore': (a) => handleNlmRestore(a[1], a[2]),
  'nlm:auth': (a) => handleNlmAuth(...a.slice(1)),
  'nlm:switch': (a) => handleNlmSwitch(...a.slice(1)),
  switch: (a) => handleNlmSwitch(...a.slice(1)),
  'gh:locate': (a) => handleGhLocate(a[1]),
  'project:list': (a) => handleProjectList(a[1]),
  'project:sync': (a) => handleProjectSync(a[1], a[2], a[3], a[4]),
  'wiki:list': () => handleWikiList(),
  'wiki:show': (a) => handleWikiShow(a[1]),
  'wiki:clean': (a) => handleWikiClean(a[1]),
  'wiki:seed': () => handleWikiSeed(),
  'wiki:sync': (a) => handleWikiSync(a.includes('--force') || a.includes('-f')),
  'wiki:status': () => handleWikiStatus(),
  merge: (a) => handleMerge(a[1], a[2]),
  'branch:sync': (a) => handleBranchSync(a[1], a[2]),
  'deps:drift': () => handleDepsDrift(),
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
  'cage:check': (a) => handleCageCheck(a.slice(1)),
  skeleton: (a) => handleSkeleton(a[1]),
  'skeleton:scan': (a) => handleSkeletonScan(a[1]),
  diff: (a) => handleDiff(a.length > 2 ? a.slice(1).join(' ') : a[1]),
  audit: (a) => handleAudit(a[1]),
  find: (a) => handleFind(a[1]),
  triage: (a) => handleTriage(a.slice(1)),
  trace: (a) => handleTrace(a[1]),
  'graph:scan': (a) => handleGraphScan(a[1]),
  'ast:search': (a) => handleAstSearch(a[1], a[2], a[3]),
  'ast-grep': (a) => handleAstSearch(a[1], a[2], a[3]),
  sg: (a) => handleAstSearch(a[1], a[2], a[3]),
  'ast:replace': (a) => handleAstReplace(a[1], a[2], a[3]),
  'rtk:compress': (a) => handleRtkCompress(a[1]),
  'context7:query': (a) => handleContext7Query(a[1], a[2]),
  'memory:query': (a) => handleMemoryQuery(a[1], a[2], a[3]),
  'memory:stats': (a) => handleMemoryStats(a[1]),
  'memory:cold-start': (a) => handleMemoryColdStart(a[1], a[2]),
  'memory:refresh': (a) => handleMemoryRefresh(a[1], a[2]),
  'memory:prune': (a) => handleMemoryPrune(a[1]),
  'memory:verify': (a) => handleMemoryVerify(a[1]),
  'memory:watch': (a) => { handleMemoryWatch(a[1], a[2]); },
  'loop:status': () => handleLoopStatus(),
  'loop:reset': (a) => handleLoopReset(a[1]),
  debug: async (a) => { await handleDebugCommand(a.slice(1).join(' ')); },
  mcp: () => startMcpServer()
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
    const rawJoin = args.join(' ');
    if (ConversationalIntentDetector.isAccountSwitchIntent(rawJoin)) {
      console.log(`🔄 Conversational Account Switch Intent Detected: "${rawJoin}"`);
      await handleNlmSwitch(...args);
      return;
    }
    const idea = detectIdeaIntent(args);
    if (idea.isIdea) {
      console.log(`💡 Idea Intent Detected: "${idea.title}"`);
      console.log(`🚀 Routing directly to Aegis RFC & Ideation Pipeline...\n`);
      await handleRfcCreate(idea.title, idea.desc);
    } else {
      const suggestion = FuzzyMatcher.suggest(command, Object.keys(commandMap), 2);
      if (suggestion) {
        showBanner();
        console.log(`⚠️  Unknown command '${command}'. Did you mean 'aegis ${suggestion}'?\n`);
        console.log(`Run 'aegis help' to see all available commands.`);
      } else {
        handleHelp();
      }
    }
  }
}

main().catch(err => {
  console.error(`💥 Fatal Error:`, err);
  process.exit(1);
});
