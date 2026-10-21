#!/usr/bin/env node

import { showBanner } from '../commands/banner.js';
import { handleInit, handleStatus, handleAuto, handleDashboard } from '../commands/core-commands.js';
import {
  handleEstimate,
  handleVerify,
  handleSkeleton,
  handleDiff,
  handleInspect,
  handleMutate,
  handleAudit
} from '../commands/dev-commands.js';
import {
  handleGhStatus,
  handleGhSync,
  handleGhComment,
  handleGhPr
} from '../commands/github-commands.js';

function handleHelp(): void {
  showBanner();
  console.log('Commands:');
  console.log('  aegis init                             Initialize worktrees and environment');
  console.log('  aegis status                           View worktrees and active file locks');
  console.log('  aegis auto                             Run autonomous task queue & dispatcher');
  console.log('  aegis dashboard [port]                 Launch Aegis Command Center web dashboard');
  console.log('  aegis gh:status [token]                Inspect live GitHub authentication & limits');
  console.log('  aegis gh:sync [token]                  Sync live issues & dispatch to agents');
  console.log('  aegis gh:comment <num> <msg> [token]   Post comment to GitHub issue');
  console.log('  aegis gh:pr <head> <base> <title> <body> Create GitHub pull request');
  console.log('  aegis inspect                          Run zero-token BoundingBox UI inspection');
  console.log('  aegis mutate [filepath]                Run Mutation Testing gate evaluation');
  console.log('  aegis estimate <files> <tests>         Compute adaptive timeout for build/test');
  console.log('  aegis verify <filepath>                Run deterministic Iron Cage validation');
  console.log('  aegis skeleton <filepath>              Generate token-saving AST Skeleton Map');
  console.log('  aegis diff <diff>                      Validate surgical unified diff compliance');
  console.log('  aegis audit <files>                    Run Immutable Oracle trust verification');
}

const commandMap: Record<string, (args: string[]) => Promise<void> | void> = {
  init: () => handleInit(),
  status: () => handleStatus(),
  auto: () => handleAuto(),
  dashboard: (a) => handleDashboard(a[1]),
  'gh:status': (a) => handleGhStatus(a[1]),
  'gh:sync': (a) => handleGhSync(a[1]),
  'gh:comment': (a) => handleGhComment(a[1], a[2], a[3]),
  'gh:pr': (a) => handleGhPr(a[1], a[2], a[3], a[4], a[5]),
  inspect: () => handleInspect(),
  mutate: (a) => handleMutate(a[1]),
  estimate: (a) => handleEstimate(a),
  verify: (a) => handleVerify(a[1]),
  skeleton: (a) => handleSkeleton(a[1]),
  diff: (a) => handleDiff(a[1]),
  audit: (a) => handleAudit(a[1])
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const handler = commandMap[command];

  if (handler) {
    await handler(args);
  } else {
    handleHelp();
  }
}

main().catch(err => {
  console.error(`💥 Fatal Error:`, err);
  process.exit(1);
});
