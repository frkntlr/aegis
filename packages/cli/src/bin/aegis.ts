#!/usr/bin/env node

/**
 * @file aegis.ts
 * Main CLI entrypoint for Aegis Autonomous Vibe Coding Engine.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from '../commands/banner.js';
import { notifyDashboardFocus } from '../commands/focus-notifier.js';
import { showHelp } from './help-text.js';
import { COMMAND_MAP } from './command-registry.js';
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

function findRelatedCommands(cmd: string, allCmds: string[]): { subMatches: string[]; partials: string[] } {
  const lower = cmd.toLowerCase().trim();
  const subMatches = allCmds.filter(c =>
    c.startsWith(`${lower}:`) || (lower.includes(':') && c.startsWith(lower))
  );
  const partials = allCmds.filter(c =>
    (c.includes(lower) || lower.includes(c)) && !subMatches.includes(c)
  );
  return { subMatches, partials };
}

function printUnknownCommandAdvice(
  command: string,
  subMatches: string[],
  partials: string[],
  fuzzy?: string | null
): void {
  showBanner();
  console.log(`⚠️  Unknown command '${command}'.\n`);
  if (fuzzy && !subMatches.includes(fuzzy) && !partials.includes(fuzzy)) {
    console.log(`💡 Did you mean: 'aegis ${fuzzy}'?\n`);
  }
  if (subMatches.length > 0) {
    console.log(`🔹 Related subcommands for '${command}':`);
    for (const sm of subMatches.slice(0, 8)) console.log(`   • aegis ${sm}`);
    console.log('');
  }
  if (partials.length > 0) {
    console.log(`💡 Matching commands containing '${command}':`);
    for (const pm of partials.slice(0, 6)) console.log(`   • aegis ${pm}`);
    console.log('');
  }
  console.log(`Run 'aegis help' for full menu, or 'aegis search ${command}' for details.`);
  console.log(`Run 'aegis completion --install' to enable tab autocompletion.`);
}

async function routeFallback(command: string, args: string[]): Promise<void> {
  const rawJoin = args.join(' ');
  const { ConversationalIntentDetector } = await import('@aegis/github-live');
  if (ConversationalIntentDetector.isAccountSwitchIntent(rawJoin)) {
    console.log(`🔄 Conversational Account Switch Intent Detected: "${rawJoin}"`);
    const { handleNlmSwitch } = await import('../commands/nlm-command.js');
    await handleNlmSwitch(...args);
    return;
  }

  const idea = detectIdeaIntent(args);
  if (idea.isIdea) {
    console.log(`💡 Idea Intent Detected: "${idea.title}"`);
    console.log(`🚀 Routing directly to Aegis RFC & Ideation Pipeline...\n`);
    const { handleRfcCreate } = await import('../commands/rfc-commands.js');
    await handleRfcCreate(idea.title, idea.desc);
    return;
  }

  const allCmds = Object.keys(COMMAND_MAP);
  const { subMatches, partials } = findRelatedCommands(command, allCmds);
  const { FuzzyMatcher } = await import('@aegis/ast-skeleton');
  const fuzzy = FuzzyMatcher.suggest(command, allCmds, 2);

  if (subMatches.length > 0 || partials.length > 0 || fuzzy) {
    printUnknownCommandAdvice(command, subMatches, partials, fuzzy);
  } else {
    showHelp();
  }
}

async function routeCommand(command: string, args: string[]): Promise<void> {
  const handler = COMMAND_MAP[command];
  if (handler) {
    await handler(args);
    return;
  }
  await routeFallback(command, args);
}

async function main(): Promise<void> {
  notifyDashboardFocus();
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  if (command === 'help' || command === 'search' || command === 'find-command') {
    showHelp(args.slice(1).join(' '));
    return;
  }
  await routeCommand(command, args);
}

main().catch(err => {
  console.error(`💥 Fatal Error:`, err);
  process.exit(1);
});
