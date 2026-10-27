import type { CageViolation } from '@aegis/shared';
import { IronCageValidator } from './cage-validator.js';
import { DiagnosticTriageEnricher, type DiagnosticCategory } from './diagnostic-triage-enricher.js';

export type TriageCategory = 'CRITICAL_DEFECT' | 'ARCHITECTURAL_DEBT' | 'CODE_SMELL';

export interface TriageFinding {
  id: string;
  category: TriageCategory;
  defectType?: DiagnosticCategory;
  title: string;
  filePath: string;
  line?: number;
  column?: number;
  evidence: string;
  blocking: boolean;
  filteredStack?: string;
  remediation?: string;
  packageScope?: string;
}

export interface TriageInput {
  targetFiles?: string[];
  violations?: CageViolation[];
  failingTestsCount?: number;
  testFailures?: string[];
  engineErrors?: string[];
  syntaxErrors?: string[];
}

export interface TriageReport {
  criticalCount: number;
  debtCount: number;
  smellCount: number;
  clean: boolean;
  findings: TriageFinding[];
  summary: string;
}

export class EvidenceBasedTriageGate {
  private validator: IronCageValidator;

  constructor(validator?: IronCageValidator) {
    this.validator = validator || new IronCageValidator();
  }

  public evaluate(input: TriageInput): TriageReport {
    const findings: TriageFinding[] = [];

    this.collectCriticalDefects(input, findings);
    this.collectViolations(input.violations || [], findings);

    const criticalCount = findings.filter(f => f.category === 'CRITICAL_DEFECT').length;
    const debtCount = findings.filter(f => f.category === 'ARCHITECTURAL_DEBT').length;
    const smellCount = findings.filter(f => f.category === 'CODE_SMELL').length;

    const clean = criticalCount === 0;
    const summary = this.buildSummary(criticalCount, debtCount, smellCount, clean);

    return { criticalCount, debtCount, smellCount, clean, findings, summary };
  }

  private collectCriticalDefects(input: TriageInput, findings: TriageFinding[]): void {
    this.collectTestDefects(input, findings);
    this.collectRuntimeDefects(input, findings);
  }

  private collectTestDefects(input: TriageInput, findings: TriageFinding[]): void {
    if (input.failingTestsCount && input.failingTestsCount > 0 && (!input.testFailures || input.testFailures.length === 0)) {
      findings.push({
        id: `crit-test-${Date.now()}-1`,
        category: 'CRITICAL_DEFECT',
        defectType: 'TEST_FAILURE',
        title: `${input.failingTestsCount} Failing Automated Test(s)`,
        filePath: input.targetFiles?.[0] || 'test_suite',
        evidence: `Automated test runner reported ${input.failingTestsCount} failing assertion(s).`,
        blocking: true
      });
    }

    for (const tf of input.testFailures || []) {
      const diag = DiagnosticTriageEnricher.classify(tf);
      findings.push({
        id: `crit-tf-${findings.length + 1}`,
        category: 'CRITICAL_DEFECT',
        defectType: diag.category,
        title: diag.title,
        filePath: diag.filePath || input.targetFiles?.[0] || 'test_suite',
        line: diag.line,
        column: diag.column,
        evidence: diag.evidence,
        filteredStack: diag.filteredStack,
        remediation: diag.remediation,
        packageScope: diag.packageScope,
        blocking: true
      });
    }
  }

  private collectRuntimeDefects(input: TriageInput, findings: TriageFinding[]): void {
    for (const ee of input.engineErrors || []) {
      const diag = DiagnosticTriageEnricher.classify(ee);
      if (/crash|null|exception|assert|fail|error/i.test(ee) || diag.category !== 'TEST_FAILURE') {
        findings.push({
          id: `crit-eng-${findings.length + 1}`,
          category: 'CRITICAL_DEFECT',
          defectType: diag.category,
          title: diag.title !== 'Assertion / Runtime Failure' ? diag.title : 'Engine Runtime Crash / Error',
          filePath: diag.filePath || input.targetFiles?.[0] || 'engine_runtime',
          line: diag.line,
          evidence: diag.evidence,
          filteredStack: diag.filteredStack,
          remediation: diag.remediation,
          packageScope: diag.packageScope,
          blocking: true
        });
      }
    }

    for (const se of input.syntaxErrors || []) {
      const diag = DiagnosticTriageEnricher.classify(se);
      findings.push({
        id: `crit-syn-${findings.length + 1}`,
        category: 'CRITICAL_DEFECT',
        defectType: diag.category,
        title: diag.title,
        filePath: diag.filePath || input.targetFiles?.[0] || 'source',
        line: diag.line,
        evidence: diag.evidence,
        remediation: diag.remediation,
        blocking: true
      });
    }
  }

  private collectViolations(violations: CageViolation[], findings: TriageFinding[]): void {
    for (const v of violations) {
      if (this.isArchitecturalDebt(v.rule)) {
        findings.push({
          id: `debt-${findings.length + 1}`,
          category: 'ARCHITECTURAL_DEBT',
          title: `Demir Kafes: ${v.rule}`,
          filePath: v.filePath,
          line: v.line,
          evidence: v.message,
          blocking: false
        });
      } else {
        findings.push({
          id: `smell-${findings.length + 1}`,
          category: 'CODE_SMELL',
          title: `Code Smell / Style: ${v.rule}`,
          filePath: v.filePath,
          line: v.line,
          evidence: v.message,
          blocking: false
        });
      }
    }
  }

  private isArchitecturalDebt(rule: string): boolean {
    return [
      'MAX_FUNCTION_LINES',
      'MAX_FILE_LINES',
      'CYCLOMATIC_COMPLEXITY',
      'GD_001_FUNC_LENGTH',
      'GD_002_FILE_LENGTH',
      'GD_006_CYCLOMATIC_COMPLEXITY',
      'GD_005_RESOURCE_LEAK',
      'GD_007_COUPLING_PARENT_NODE',
      'GD_008_TYPED_GDSCRIPT',
      'GD_009_BAND_AID_PREVENTION',
      'TS_001_NO_ANY',
      'TS_002_EMPTY_CATCH',
      'TS_003_NESTING_DEPTH'
    ].includes(rule);
  }

  public triageFile(filePath: string, content: string, engineErrors: string[] = []): TriageReport {
    const res = this.validator.validateFileContent(filePath, content);
    return this.evaluate({
      targetFiles: [filePath],
      violations: res.violations,
      engineErrors
    });
  }

  private buildSummary(crit: number, debt: number, smell: number, clean: boolean): string {
    const status = clean ? 'CLEAN (Zero blocking bugs) ✅' : 'DEFECTS FOUND ❌';
    return [
      `Triage Report: ${status}`,
      ` • Critical Defects:    ${crit}`,
      ` • Architectural Debt:  ${debt} (Demir Kafes refactor pool)`,
      ` • Code Smells:         ${smell}`
    ].join('\n');
  }
}
