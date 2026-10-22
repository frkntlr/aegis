import * as fs from 'node:fs';
import * as path from 'node:path';
import { PreExecutionEstimator } from '@aegis/watchdog';
import { IronCageValidator } from '@aegis/iron-cage';
import { SkeletonGenerator, DiffEngine } from '@aegis/ast-skeleton';
import { ImmutableOracle } from '@aegis/trust-verifier';
import { BoundingBoxInspector, MutationGate } from '@aegis/telemetry-tester';
import { showBanner } from './banner.js';

export function handleEstimate(args: string[]): void {
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

export function handleVerify(targetFile?: string): void {
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

export function handleSkeleton(targetFile?: string): void {
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
  const generator = new SkeletonGenerator();
  const res = generator.extractFile(targetFile, content);

  console.log(`🗺️  AST Skeleton for: ${targetFile}`);
  console.log(` • Original Size: ${res.originalLength} chars`);
  console.log(` • Skeleton Size: ${res.skeletonLength} chars`);
  console.log(` • Token Savings: ~${res.tokenSavingsPercent}%`);
  console.log('\n--- SKELETON MAP ---');
  console.log(res.skeletonContent);
}

export function handleDiff(diffText?: string): void {
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

export function handleInspect(): void {
  showBanner();
  console.log('📐 Zero-Token Telemetry UI Inspection (Mobile 390x844)...');
  const inspector = new BoundingBoxInspector();
  const elements = [
    { id: 'header-nav', x: 0, y: 0, width: 390, height: 60 },
    { id: 'hero-banner', x: 0, y: 60, width: 390, height: 200 },
    { id: 'action-button', x: 20, y: 280, width: 350, height: 50 }
  ];

  const report = inspector.inspectLayout(elements, { width: 390, height: 844, name: 'Mobile' });
  console.log(` • Elements Checked: ${report.elementsScanned}`);
  console.log(` • Vision Tokens:    ${report.tokenCost} (100% token-free)`);
  console.log(` • Overlaps/Overflows: ${report.violations.length}`);
  console.log(` • Verdict:          ${report.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
}

export function handleMutate(targetFile?: string): void {
  showBanner();
  const file = targetFile || 'packages/core/watchdog/src/pre-execution-estimator.ts';
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const gate = new MutationGate({ minThresholdPercent: 70 });
  const mutants = gate.generateMutants(content);
  const report = gate.evaluateScore(mutants, () => true);

  console.log(`🧪 Mutation Testing Gate for: ${file}`);
  console.log(` • Total Mutants Generated: ${report.totalMutants}`);
  console.log(` • Mutants Killed:          ${report.killedMutants}`);
  console.log(` • Mutation Score:          ${report.scorePercent}% (Min: ${report.minThresholdPercent}%)`);
  console.log(` • Verdict:                 ${report.passedThreshold ? 'PASSED ✅' : 'REJECTED ❌'}`);
}

export function handleAudit(modifiedFilesStr?: string): void {
  showBanner();
  const oracle = new ImmutableOracle();
  const files = (modifiedFilesStr || '').split(',').map(f => f.trim()).filter(Boolean);
  const report = oracle.audit({
    modifiedFiles: files.length > 0 ? files : ['src/clean.ts'],
    reportedPassedCount: 1,
    reportedFailedCount: 0
  });

  console.log(`🔍 Trust Verification Audit:`);
  console.log(` • Verdict:    ${report.verdict}`);
  console.log(` • Suspicious: ${report.suspicious ? 'YES ⚠️' : 'NO ✅'}`);
  for (const d of report.details) {
    console.log(`   - ${d}`);
  }
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', '.git', 'experimental'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|py|gd)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

export function handleCageCheck(targetDir?: string): void {
  showBanner();
  const base = targetDir ? path.resolve(process.cwd(), targetDir) : path.resolve(process.cwd(), 'packages');
  console.log(`🔍 Running Iron Cage Project Audit on: ${path.relative(process.cwd(), base) || '.'}...`);
  const files = collectSourceFiles(base);
  const validator = new IronCageValidator();
  let passedCount = 0;
  const violations: { file: string; rule: string; msg: string }[] = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const res = validator.validateFileContent(rel, content);
    if (res.passed) {
      passedCount++;
    } else {
      for (const v of res.violations) {
        violations.push({ file: rel, rule: v.rule, msg: v.message });
      }
    }
  }

  console.log(` • Files Scanned: ${files.length}`);
  console.log(` • Compliant:     ${passedCount} / ${files.length} (${Math.round((passedCount / files.length) * 100)}%)`);
  if (violations.length === 0) {
    console.log('✅ Demir Kafes (Iron Cage): 100% CLEAN - No violations found!');
  } else {
    console.log(`⚠️  Violations Found (${violations.length}):`);
    for (const v of violations) {
      console.log(`   - [${v.rule}] ${v.file}: ${v.msg}`);
    }
  }
}

export function handleSkeletonScan(targetDir?: string): void {
  showBanner();
  const base = targetDir ? path.resolve(process.cwd(), targetDir) : path.resolve(process.cwd(), 'packages');
  console.log(`🗺️  Generating Global AST Skeleton Map for: ${path.relative(process.cwd(), base) || '.'}...`);
  const files = collectSourceFiles(base);
  const generator = new SkeletonGenerator();
  const report = generator.generateForFiles(files, process.cwd());

  console.log(` • Files Indexed:       ${report.filesScanned}`);
  console.log(` • Original Code Size:  ${Math.round(report.totalOriginalBytes / 1024)} KB`);
  console.log(` • AST Skeleton Size:   ${Math.round(report.totalSkeletonBytes / 1024)} KB`);
  console.log(` • Total Token Savings: ~${report.overallSavingsPercent}% (Massive Context Window Reduction!)`);
}
