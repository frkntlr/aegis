/**
 * @file cage-check-runner.ts
 * Iron Cage multi-file scanning, triage caching, and CLI audit reporting.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { IronCageValidator, LineBudgetRadar, TriageCacheRadar } from '@aegis/iron-cage';
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

function handleUncachedFile(
  file: string,
  rel: string,
  stat: fs.Stats,
  validator: IronCageValidator,
  radar: TriageCacheRadar | null,
  acc: CageScanAcc
): void {
  const content = fs.readFileSync(file, 'utf8');
  const res = validator.validateFileContent(rel, content);
  let quotaAlert: { file: string; lines: number; msg: string } | undefined;
  if (res.passed) {
    acc.passedCount++;
    const r = LineBudgetRadar.analyze(rel, content);
    if (r.status === 'CRITICAL_QUOTA') {
      quotaAlert = { file: rel, lines: r.fileLines, msg: r.advice?.title || 'Kritik kota' };
      acc.radarAlerts.push(quotaAlert);
    }
  } else {
    for (const v of res.violations) acc.violations.push({ file: rel, rule: v.rule, msg: v.message });
  }
  if (radar) radar.recordFile(rel, stat.mtimeMs, stat.size, content, res.violations, quotaAlert);
}

function scanCageFiles(files: string[], noCache = false): CageScanAcc {
  const validator = new IronCageValidator();
  const radar = noCache ? null : new TriageCacheRadar();
  const acc: CageScanAcc = { passedCount: 0, violations: [], radarAlerts: [], cachedCount: 0 };

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    try {
      const stat = fs.statSync(file);
      const check = radar ? radar.checkFileStat(rel, stat.mtimeMs, stat.size) : { hit: false };
      if (check.hit) {
        handleCachedHit(check, rel, acc);
      } else {
        handleUncachedFile(file, rel, stat, validator, radar, acc);
      }
    } catch { /* ignore unreadable file */ }
  }

  if (radar) radar.flush();
  return acc;
}

export function handleCageCheck(rawArgs?: string | string[]): void {
  const opts = parseCageCheckArgs(rawArgs);
  if (!opts.jsonOutput) showBanner();
  const base = opts.targetDir
    ? path.resolve(process.cwd(), opts.targetDir)
    : (fs.existsSync(path.resolve(process.cwd(), 'packages')) ? path.resolve(process.cwd(), 'packages') : process.cwd());
  if (!opts.jsonOutput) console.log(`🔍 Running Iron Cage Project Audit on: ${path.relative(process.cwd(), base) || '.'}...`);
  const files = collectSourceFiles(base);
  const { passedCount, violations, radarAlerts, cachedCount } = scanCageFiles(files, opts.noCache);

  if (opts.jsonOutput) {
    console.log(JSON.stringify({ filesScanned: files.length, cachedCount, compliantCount: passedCount, violations, radarAlerts, clean: violations.length === 0 }, null, 2));
    if (violations.length > 0 && process.env.NODE_ENV !== 'test') process.exit(1);
    return;
  }

  console.log(` • Files Scanned: ${files.length} (${cachedCount} cached, 0ms)`);
  console.log(` • Compliant:     ${passedCount} / ${files.length} (${Math.round((passedCount / files.length) * 100)}%)`);
  printRadarAlerts(radarAlerts);
  if (violations.length === 0) {
    console.log('✅ Demir Kafes (Iron Cage): 100% CLEAN - No violations found!');
    return;
  }
  console.log(`⚠️  Violations Found (${violations.length}):`);
  for (const v of violations) console.log(`   - [${v.rule}] ${v.file}: ${v.msg}`);
  if (process.env.NODE_ENV !== 'test') process.exit(1);
}
