import * as fs from 'node:fs';
import * as path from 'node:path';
import { PreExecutionEstimator } from '@aegis/watchdog';
import { IronCageValidator } from '@aegis/iron-cage';
import { SkeletonGenerator, DiffEngine } from '@aegis/ast-skeleton';
import { debugLogIgnored } from '@aegis/shared';
import { showBanner } from './banner.js';
import { verifyFile, getChangedSourceFiles, collectSourceFiles } from './dev-helpers.js';

export { handleCageCheck } from './cage-check-runner.js';
export { handleInspect, handleMutate, handleAudit } from './dev-quality-commands.js';

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
