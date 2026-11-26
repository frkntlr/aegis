import { ImmutableOracle } from '@aegis/trust-verifier';
import { BoundingBoxInspector, MutationGate } from '@aegis/telemetry-tester';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';
import {
  getChangedLinesForFile,
  getChangedSourceFiles,
  runMutationGateOnFile,
  loadInspectBoxes,
  getGitModifiedFiles,
  loadAuditTestReport,
  collectAuditTestContents
} from './dev-helpers.js';

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
