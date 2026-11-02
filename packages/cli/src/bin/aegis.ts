#!/usr/bin/env node

/**
 * @file aegis.ts
 * Main CLI entrypoint for Aegis Autonomous Vibe Coding Engine.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from '../commands/banner.js';
import { notifyDashboardFocus } from '../commands/focus-notifier.js';
import { handleNlmSwitch } from '../commands/nlm-command.js';
import { handleRfcCreate } from '../commands/rfc-commands.js';
import { FuzzyMatcher } from '@aegis/ast-skeleton';
import { ConversationalIntentDetector } from '@aegis/github-live';
import { showHelp } from './help-text.js';
import { COMMAND_MAP } from './command-registry.js';

function handleHelp(): void {
  showHelp();
}

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

async function routeCommand(command: string, args: string[]): Promise<void> {
  const handler = COMMAND_MAP[command];
  if (handler) {
    await handler(args);
    return;
  }

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
    return;
  }

  const suggestion = FuzzyMatcher.suggest(command, Object.keys(COMMAND_MAP), 2);
  if (suggestion) {
    showBanner();
    console.log(`⚠️  Unknown command '${command}'. Did you mean 'aegis ${suggestion}'?\n`);
    console.log(`Run 'aegis help' to see all available commands.`);
  } else {
    handleHelp();
  }
}

async function main(): Promise<void> {
  notifyDashboardFocus();
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  await routeCommand(command, args);
}

main().catch(err => {
  console.error(`💥 Fatal Error:`, err);
  process.exit(1);
});
