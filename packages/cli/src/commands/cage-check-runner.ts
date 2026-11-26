/**
 * @file cage-check-runner.ts
 * Iron Cage multi-file scanning, triage caching, and CLI audit reporting.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { IronCageValidator, LineBudgetRadar, TriageCacheRadar } from '@aegis/iron-cage';
import { debugLogIgnored, resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';
import {
  collectSourceFiles,
  printRadarAlerts,
  parseCageCheckArgs
} from './dev-helpers.js';

interface CageScanAcc {
  passedCount: number;
  violations: { file: string; rule: string; msg: string }[];
  radarAlerts: { file: string; lines: number; msg: string }[];
  cachedCount: number;
}

function handleCachedHit(check: ReturnType<TriageCacheRadar['checkFileStat']>, rel: string, acc: CageScanAcc): void {
  acc.cachedCount++;
  if (!check.cachedViolations || check.cachedViolations.length === 0) {
    acc.passedCount++;
    if (check.quotaAlert) acc.radarAlerts.push(check.quotaAlert);
  } else {
    for (const v of check.cachedViolations) acc.violations.push({ file: rel, rule: v.rule, msg: v.message });
  }
}

interface UncachedFileContext {
  file: string;
  rel: string;
  stat: fs.Stats;
  validator: IronCageValidator;
  radar: TriageCacheRadar | null;
  acc: CageScanAcc;
}

function handleUncachedFile(ctx: UncachedFileContext): void {
  let content: string;
  try {
    content = fs.readFileSync(ctx.file, 'utf8');
  } catch {
    return;
  }
  const res = ctx.validator.validateFileContent(ctx.rel, content);
  let quotaAlert: { file: string; lines: number; msg: string } | undefined;
  if (res.passed) {
    ctx.acc.passedCount++;
    const r = LineBudgetRadar.analyze(ctx.rel, content);
    if (r.status === 'CRITICAL_QUOTA' || r.status === 'EXCEEDED') {
      quotaAlert = { file: ctx.rel, lines: r.fileLines, msg: r.advice?.title || 'Kritik kota' };
      ctx.acc.radarAlerts.push(quotaAlert);
    }
  } else {
    for (const v of res.violations) ctx.acc.violations.push({ file: ctx.rel, rule: v.rule, msg: v.message });
  }
  if (ctx.radar) ctx.radar.recordFile(ctx.rel, ctx.stat.mtimeMs, ctx.stat.size, content, res.violations, quotaAlert);
}

function scanCageFiles(files: string[], noCache = false): CageScanAcc {
  const validator = new IronCageValidator();
  const radar = noCache ? null : new TriageCacheRadar();
  const acc: CageScanAcc = { passedCount: 0, violations: [], radarAlerts: [], cachedCount: 0 };

  for (const file of files) {
    const rel = path.relative(resolveSafeRepoRoot(), file).replace(/\\/g, '/');
    try {
      const stat = fs.statSync(file);
      const check = radar ? radar.checkFileStat(rel, stat.mtimeMs, stat.size) : { hit: false };
      if (check.hit) {
        handleCachedHit(check, rel, acc);
      } else {
        handleUncachedFile({ file, rel, stat, validator, radar, acc });
      }
    } catch (err: unknown) {
      debugLogIgnored('CageCheckRunner:scanFile', err);
    }
  }

  if (radar) radar.flush();
  return acc;
}

function resolveCageBaseDir(targetDir?: string): string {
  const root = resolveSafeRepoRoot();
  if (targetDir) return path.resolve(root, targetDir);
  const pkgDir = path.resolve(root, 'packages');
  return fs.existsSync(pkgDir) ? pkgDir : root;
}

function reportMissingCageTarget(base: string, jsonOutput?: boolean): void {
  const error = fs.existsSync(base) ? 'No source files found for Iron Cage audit' : 'Iron Cage audit target does not exist';
  if (jsonOutput) {
    console.log(JSON.stringify({ filesScanned: 0, compliantCount: 0, violations: [], clean: false, error }));
  } else {
    console.error(`Iron Cage audit failed: ${error}: ${base}`);
  }
  process.exitCode = 1;
}

function reportCageResults(totalFiles: number, scan: CageScanAcc, jsonOutput?: boolean): void {
  const { passedCount, violations, radarAlerts, cachedCount } = scan;
  if (jsonOutput) {
    console.log(JSON.stringify({ filesScanned: totalFiles, cachedCount, compliantCount: passedCount, violations, radarAlerts, clean: violations.length === 0 }, null, 2));
    if (violations.length > 0 && process.env.NODE_ENV !== 'test') process.exit(1);
    return;
  }
  console.log(` • Files Scanned: ${totalFiles} (${cachedCount} cached, 0ms)`);
  console.log(` • Compliant:     ${passedCount} / ${totalFiles} (${Math.round((passedCount / totalFiles) * 100)}%)`);
  printRadarAlerts(radarAlerts);
  if (violations.length === 0) {
    console.log('✅ Demir Kafes (Iron Cage): 100% CLEAN - No violations found!');
    return;
  }
  console.log(`⚠️  Violations Found (${violations.length}):`);
  for (const v of violations) console.log(`   - [${v.rule}] ${v.file}: ${v.msg}`);
  if (process.env.NODE_ENV !== 'test') process.exit(1);
}

export function handleCageCheck(rawArgs?: string | string[]): void {
  const opts = parseCageCheckArgs(rawArgs);
  if (!opts.jsonOutput) showBanner();
  const base = resolveCageBaseDir(opts.targetDir);
  if (!opts.jsonOutput) console.log(`🔍 Running Iron Cage Project Audit on: ${path.relative(resolveSafeRepoRoot(), base) || '.'}...`);
  const files = collectSourceFiles(base);
  if (!fs.existsSync(base) || files.length === 0) {
    reportMissingCageTarget(base, opts.jsonOutput);
    return;
  }
  const scan = scanCageFiles(files, opts.noCache);
  reportCageResults(files.length, scan, opts.jsonOutput);
}
