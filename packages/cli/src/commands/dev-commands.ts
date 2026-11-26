import * as fs from 'node:fs';
import * as path from 'node:path';
import { PreExecutionEstimator } from '@aegis/watchdog';
import { IronCageValidator } from '@aegis/iron-cage';
import { SkeletonGenerator, DiffEngine } from '@aegis/ast-skeleton';
import { ImmutableOracle } from '@aegis/trust-verifier';
import { BoundingBoxInspector, MutationGate } from '@aegis/telemetry-tester';
import { debugLogIgnored, resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';
import {
  verifyFile,
  getChangedLinesForFile,
  getChangedSourceFiles,
  runMutationGateOnFile,
  collectSourceFiles,
  loadInspectBoxes,
  getGitModifiedFiles,
  loadAuditTestReport,
  collectAuditTestContents
} from './dev-helpers.js';
import { handleCageCheck } from './cage-check-runner.js';

export { handleCageCheck };

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
  const validator = new IronCageValidator();
  if (targetFile) {
    if (!verifyFile(targetFile, validator)) process.exit(1);
    return;
  }
  const targets = getChangedSourceFiles();
  const list = targets.length > 0 ? targets : ['packages/cli/src/bin/aegis.ts'];
  console.log(`🔍 Verifying ${list.length} target file(s) against Demir Kafes...`);
  if (!list.every(f => verifyFile(f, validator))) process.exit(1);
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

  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to read ${fullPath}: ${msg}`);
    process.exit(1);
  }
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
  let diffContent = diffText || '';
  if (diffText && fs.existsSync(diffText)) {
    try {
      diffContent = fs.readFileSync(diffText, 'utf8');
    } catch (err: unknown) {
      debugLogIgnored('dev-commands:diff', err);
      diffContent = diffText;
    }
  }
  const engine = new DiffEngine();
  const parsed = engine.parseAndValidate(diffContent);
  if (parsed.isSurgical) {
    console.log(`✅ Diff is Surgical: +${parsed.addedLinesCount} / -${parsed.deletedLinesCount} lines`);
  } else {
    console.error(`❌ Diff Rejected: ${parsed.rejectionReason}`);
    process.exit(1);
  }
}

export function handleInspect(targetArg?: string): void {
  showBanner();
  console.log('📐 Zero-Token Telemetry UI Inspection (Mobile 390x844)...');
  const { boxes, error } = loadInspectBoxes(targetArg);
  if (error || boxes.length === 0) {
    console.error(`❌ UI Telemetry Inspection Unavailable: ${error ?? 'No valid bounding boxes found.'}`);
    process.exitCode = 1;
    return;
  }

  const inspector = new BoundingBoxInspector();
  const report = inspector.inspectLayout(boxes, { width: 390, height: 844, name: 'Mobile' });
  console.log(` • Elements Checked: ${report.elementsScanned}`);
  console.log(` • Vision Tokens:    ${report.tokenCost} (100% token-free)`);
  console.log(` • Overlaps/Overflows: ${report.violations.length}`);
  for (const v of report.violations.slice(0, 5)) console.log(`   - [${v.type}] ${v.message}`);
  console.log(` • Verdict:          ${report.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  if (!report.passed) process.exitCode = 1;
}

export function handleMutate(...targetFiles: string[]): void {
  showBanner();
  const gate = new MutationGate({ minThresholdPercent: 70 });
  const explicitFiles = targetFiles.filter(f => Boolean(f && f.trim()));

  if (explicitFiles.length > 0) {
    if (!explicitFiles.every(file => runMutationGateOnFile(file, gate))) process.exit(1);
    return;
  }

  const changedFiles = getChangedSourceFiles();
  if (changedFiles.length > 0) {
    const repoRoot = resolveSafeRepoRoot();
    console.log(`🔍 Detected ${changedFiles.length} changed TypeScript source file(s) for mutation testing:`);
    if (!changedFiles.every(file => runMutationGateOnFile(file, gate, getChangedLinesForFile(file, repoRoot)))) process.exit(1);
    console.log('✅ All changed files passed the Mutation Testing Gate!');
    return;
  }

  const fallback = 'packages/core/watchdog/src/pre-execution-estimator.ts';
  console.log(`ℹ️ No changed TypeScript source files detected. Running baseline on: ${fallback}`);
  if (!runMutationGateOnFile(fallback, gate)) process.exit(1);
}

export function handleAudit(modifiedFilesStr?: string): void {
  showBanner();
  const root = resolveSafeRepoRoot();
  const explicit = modifiedFilesStr !== undefined;
  const files = explicit
    ? modifiedFilesStr.split(',').map(f => f.trim()).filter(Boolean)
    : getGitModifiedFiles(root);

  if (files.length === 0) {
    console.error('🔍 Trust Verification Audit:\n • Verdict:    UNAVAILABLE\n • Details:    No modified files supplied or detected.');
    process.exitCode = 1;
    return;
  }

  const testReport = loadAuditTestReport(root);
  const testContents = collectAuditTestContents(files, root);
  if (testReport.failedCount === 0 && (!testReport.found || testReport.passedCount <= 0 || testContents.length === 0)) {
    console.error('🔍 Trust Verification Audit:\n • Verdict:    MANUAL_REVIEW_REQUIRED\n • Details:    Incomplete test evidence (require executed passing test report and companion test files).');
    process.exitCode = 1;
    return;
  }

  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: files,
    testContents,
    reportedPassedCount: testReport.passedCount,
    reportedFailedCount: testReport.failedCount
  });
  console.log(`🔍 Trust Verification Audit:`);
  console.log(` • Verdict:    ${report.verdict}`);
  console.log(` • Suspicious: ${report.suspicious ? 'YES ⚠️' : 'NO ✅'}`);
  for (const d of report.details) console.log(`   - ${d}`);
  if (report.verdict !== 'APPROVED') process.exitCode = 1;
}

export function handleSkeletonScan(targetDir?: string): void {
  showBanner();
  const base = targetDir ? path.resolve(process.cwd(), targetDir) : (fs.existsSync(path.resolve(process.cwd(), 'packages')) ? path.resolve(process.cwd(), 'packages') : process.cwd());
  console.log(`🗺️  Generating Global AST Skeleton Map for: ${path.relative(process.cwd(), base) || '.'}...`);
  const files = collectSourceFiles(base);
  const generator = new SkeletonGenerator();
  const report = generator.generateForFiles(files, process.cwd());

  console.log(` • Files Indexed:       ${report.filesScanned}`);
  console.log(` • Original Code Size:  ${Math.round(report.totalOriginalBytes / 1024)} KB`);
  console.log(` • AST Skeleton Size:   ${Math.round(report.totalSkeletonBytes / 1024)} KB`);
  console.log(` • Total Token Savings: ~${report.overallSavingsPercent}% (Massive Context Window Reduction!)`);
}
