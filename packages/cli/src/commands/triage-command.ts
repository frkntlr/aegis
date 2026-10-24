import * as fs from 'node:fs';
import * as path from 'node:path';
import { EvidenceBasedTriageGate, IronCageValidator, type TriageFinding } from '@aegis/iron-cage';
import type { CageViolation } from '@aegis/shared';
import { showBanner } from './banner.js';
import { collectSourceFiles } from './dev-helpers.js';

export function handleTriage(targetDir?: string): void {
  showBanner();
  const base = targetDir ? path.resolve(process.cwd(), targetDir) : path.resolve(process.cwd(), 'packages');
  console.log(`🛡️  Running Evidence-Based Bug Triage on: ${path.relative(process.cwd(), base) || '.'}...`);

  const files = collectSourceFiles(base);
  const validator = new IronCageValidator();
  const allViolations: CageViolation[] = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    try {
      const content = fs.readFileSync(file, 'utf8');
      const res = validator.validateFileContent(rel, content);
      allViolations.push(...res.violations);
    } catch { /* ignore unreadable */ }
  }

  const gate = new EvidenceBasedTriageGate(validator);
  const report = gate.evaluate({
    targetFiles: files.map(f => path.relative(process.cwd(), f)),
    violations: allViolations
  });

  printTriageReport(report, files.length);

  if (!report.clean) {
    process.exit(1);
  }
}

function printTriageReport(report: ReturnType<EvidenceBasedTriageGate['evaluate']>, filesCount: number): void {
  console.log(` • Files Scanned:       ${filesCount}`);
  console.log(` • 🔴 Critical Defects: ${report.criticalCount} (Test/Log/Crash proven bugs)`);
  console.log(` • 🟡 Tech Debt:         ${report.debtCount} (Demir Kafes >40 line / complexity refactors)`);
  console.log(` • ⚪ Code Smells:       ${report.smellCount}`);
  console.log('──────────────────────────────────────────────────');

  if (report.clean) {
    console.log('✅ Triage Verdict: CLEAN (Zero blocking bugs). No false alarms triggered!');
    if (report.debtCount > 0) {
      console.log(`ℹ️  Note: ${report.debtCount} Demir Kafes style items segregated to Refactor pool.`);
    }
  } else {
    console.log(`❌ Triage Verdict: ${report.criticalCount} Critical Defect(s) need immediate fix:`);
    for (const f of report.findings.filter((item: TriageFinding) => item.category === 'CRITICAL_DEFECT')) {
      console.log(`   - [${f.filePath}] ${f.title}: ${f.evidence}`);
    }
  }
}
