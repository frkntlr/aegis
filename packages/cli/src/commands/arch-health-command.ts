/**
 * @file arch-health-command.ts
 * CLI command handler for `aegis arch:health` and `aegis arch:audit`.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ArchitectureHealthAuditor,
  formatArchitectureHealthReport,
  type ArchitectureHealthReport
} from '@aegis/iron-cage';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';

export interface ArchHealthOptions {
  targetDir?: string;
  jsonOutput: boolean;
  strict: boolean;
  maxCycles: number;
  minScore: number;
}

export interface ArchHealthDeps {
  auditDirectory: (targetDir: string) => ArchitectureHealthReport;
  formatReport: (report: ArchitectureHealthReport) => string;
}

function parseNumericFlag(rawValue: string, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function applyArchHealthArg(opts: ArchHealthOptions, args: string[], index: number): number {
  const arg = args[index];
  if (arg === '--json') { opts.jsonOutput = true; return index; }
  if (arg === '--strict') { opts.strict = true; return index; }
  if (arg.startsWith('--max-cycles=')) {
    opts.maxCycles = parseNumericFlag(arg.slice('--max-cycles='.length), opts.maxCycles);
    return index;
  }
  if (arg === '--max-cycles' && args[index + 1]) {
    opts.maxCycles = parseNumericFlag(args[index + 1], opts.maxCycles);
    return index + 1;
  }
  if (arg.startsWith('--min-score=')) {
    opts.minScore = parseNumericFlag(arg.slice('--min-score='.length), opts.minScore);
    return index;
  }
  if (arg === '--min-score' && args[index + 1]) {
    opts.minScore = parseNumericFlag(args[index + 1], opts.minScore);
    return index + 1;
  }
  if (!arg.startsWith('-') && !opts.targetDir) opts.targetDir = arg;
  return index;
}

export function parseArchHealthArgs(args: string[] = []): ArchHealthOptions {
  const opts: ArchHealthOptions = { jsonOutput: false, strict: false, maxCycles: 0, minScore: 70 };
  for (let i = 0; i < args.length; i++) {
    if (!args[i]) continue;
    i = applyArchHealthArg(opts, args, i);
  }
  return opts;
}

export function resolveArchHealthTarget(targetDir?: string, repoRoot = resolveSafeRepoRoot()): string {
  if (targetDir) return path.resolve(repoRoot, targetDir);
  const packagesDir = path.resolve(repoRoot, 'packages');
  return fs.existsSync(packagesDir) ? packagesDir : repoRoot;
}

function createDefaultDeps(): ArchHealthDeps {
  return {
    auditDirectory: (dir: string) => new ArchitectureHealthAuditor().auditDirectory(dir),
    formatReport: (report: ArchitectureHealthReport) => formatArchitectureHealthReport(report)
  };
}

export function handleArchHealth(args: string[] = [], deps: ArchHealthDeps = createDefaultDeps()): void {
  const opts = parseArchHealthArgs(args);
  if (!opts.jsonOutput) showBanner();

  const resolvedDir = resolveArchHealthTarget(opts.targetDir);
  if (!fs.existsSync(resolvedDir)) {
    const error = `Architecture health target does not exist: ${resolvedDir}`;
    if (opts.jsonOutput) console.log(JSON.stringify({ targetDir: resolvedDir, error }, null, 2));
    else console.error(`❌ ${error}`);
    process.exitCode = 1;
    return;
  }

  const report = deps.auditDirectory(resolvedDir);
  console.log(opts.jsonOutput ? JSON.stringify(report, null, 2) : deps.formatReport(report));

  const strictFailed = opts.strict && (
    report.runtimeCycles.length > opts.maxCycles ||
    report.healthScore < opts.minScore
  );
  if (strictFailed) {
    if (!opts.jsonOutput) {
      console.error(
        `❌ Strict gate failed (runtimeCycles=${report.runtimeCycles.length}, maxCycles=${opts.maxCycles}, healthScore=${report.healthScore}, minScore=${opts.minScore}).`
      );
    }
    process.exitCode = 1;
  }
}
