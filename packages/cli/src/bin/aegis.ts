#!/usr/bin/env node

import { WorktreeManager } from '@aegis/orchestrator';
import { PreExecutionEstimator } from '@aegis/watchdog';
import { IronCageValidator } from '@aegis/iron-cage';
import { TypeScriptSkeletonExtractor, DiffEngine } from '@aegis/ast-skeleton';
import * as fs from 'node:fs';
import * as path from 'node:path';

function showBanner(): void {
  console.log('🛡️  AEGIS - Autonomous Vibe Coding Engine (v0.1.0)');
  console.log('──────────────────────────────────────────────────');
}

function handleInit(): void {
  showBanner();
  console.log('🚀 Initializing Aegis environment...');
  const wtManager = new WorktreeManager();
  const alice = wtManager.ensureWorktree('alice');
  const bob = wtManager.ensureWorktree('bob');
  console.log(`✅ Worktree ready: ${alice.agentName} -> ${alice.path}`);
  console.log(`✅ Worktree ready: ${bob.agentName} -> ${bob.path}`);
  console.log('✅ Constitution & Toolchain loaded.');
  console.log('🎯 Aegis initialization complete.');
}

function handleStatus(): void {
  showBanner();
  const wtManager = new WorktreeManager();
  const list = wtManager.listWorktrees();
  console.log(`Active Worktrees: ${list.activeCount}`);
  for (const wt of list.worktrees) {
    console.log(` - Agent [${wt.agentName}] | Branch: ${wt.branch} | Path: ${wt.path}`);
  }
  const locked = wtManager.getLockedFiles();
  console.log(`Active Locks: ${locked.size}`);
  for (const [file, agent] of locked.entries()) {
    console.log(` - [${agent}] locked: ${file}`);
  }
}

function handleEstimate(args: string[]): void {
  showBanner();
  const estimator = new PreExecutionEstimator();
  const files = parseInt(args[1] || '1', 10);
  const tests = parseInt(args[2] || '2', 10);
  const depth = parseInt(args[3] || '1', 10);
  const hist = parseFloat(args[4] || '0');

  const est = estimator.estimate({
    blastRadiusFiles: files,
    affectedTestCount: tests,
    dependencyDepth: depth,
    historicalAverageSeconds: hist
  });

  console.log(`🧠 Dynamic Timeout Estimation:`);
  console.log(` • Timeout Limit: ${est.calculatedTimeoutSeconds}s`);
  console.log(` • Confidence:    ${est.confidence.toUpperCase()}`);
  console.log(` • Reasoning:     ${est.reasoning}`);
}

function handleVerify(targetFile?: string): void {
  showBanner();
  if (!targetFile) {
    console.error('❌ Usage: aegis verify <filepath>');
    process.exit(1);
  }
  const fullPath = path.resolve(process.cwd(), targetFile);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const validator = new IronCageValidator();
  const res = validator.validateFileContent(targetFile, content);

  if (res.passed) {
    console.log(`✅ Iron Cage: PASSED for ${targetFile}`);
  } else {
    console.error(`❌ Iron Cage: REJECTED (${res.violations.length} violations)`);
    for (const v of res.violations) {
      console.error(` • [${v.rule}] ${v.message}`);
    }
    process.exit(1);
  }
}

function handleSkeleton(targetFile?: string): void {
  showBanner();
  if (!targetFile) {
    console.error('❌ Usage: aegis skeleton <filepath>');
    process.exit(1);
  }
  const fullPath = path.resolve(process.cwd(), targetFile);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const extractor = new TypeScriptSkeletonExtractor();
  const res = extractor.extract(targetFile, content);

  console.log(`🗺️  AST Skeleton for: ${targetFile}`);
  console.log(` • Original Size: ${res.originalLength} chars`);
  console.log(` • Skeleton Size: ${res.skeletonLength} chars`);
  console.log(` • Token Savings: ~${res.tokenSavingsPercent}%`);
  console.log('\n--- SKELETON MAP ---');
  console.log(res.skeletonContent);
}

function handleDiff(diffText?: string): void {
  showBanner();
  if (!diffText) {
    console.error('❌ Usage: aegis diff <diffStringOrFile>');
    process.exit(1);
  }
  const engine = new DiffEngine();
  const parsed = engine.parseAndValidate(diffText);
  if (parsed.isSurgical) {
    console.log(`✅ Diff is Surgical: +${parsed.addedLinesCount} / -${parsed.deletedLinesCount} lines`);
  } else {
    console.error(`❌ Diff Rejected: ${parsed.rejectionReason}`);
    process.exit(1);
  }
}

function handleHelp(): void {
  showBanner();
  console.log('Commands:');
  console.log('  aegis init                         Initialize worktrees and environment');
  console.log('  aegis status                       View worktrees and active file locks');
  console.log('  aegis estimate <files> <tests>     Compute adaptive timeout for build/test');
  console.log('  aegis verify <filepath>            Run deterministic Iron Cage validation');
  console.log('  aegis skeleton <filepath>          Generate token-saving AST Skeleton Map');
  console.log('  aegis diff <diff>                  Validate surgical unified diff compliance');
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'init': handleInit(); break;
    case 'status': handleStatus(); break;
    case 'estimate': handleEstimate(args); break;
    case 'verify': handleVerify(args[1]); break;
    case 'skeleton': handleSkeleton(args[1]); break;
    case 'diff': handleDiff(args[1]); break;
    case 'help':
    default: handleHelp(); break;
  }
}

main();
