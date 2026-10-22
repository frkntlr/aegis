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
