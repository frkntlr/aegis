import type { CageViolation } from '@aegis/shared';
import { IronCageValidator } from './cage-validator.js';

export type TriageCategory = 'CRITICAL_DEFECT' | 'ARCHITECTURAL_DEBT' | 'CODE_SMELL';

export interface TriageFinding {
  id: string;
  category: TriageCategory;
  title: string;
  filePath: string;
  line?: number;
  evidence: string;
  blocking: boolean;
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
    if (input.failingTestsCount && input.failingTestsCount > 0) {
      findings.push({
        id: `crit-test-${Date.now()}-1`,
        category: 'CRITICAL_DEFECT',
        title: `${input.failingTestsCount} Failing Automated Test(s)`,
        filePath: input.targetFiles?.[0] || 'test_suite',
        evidence: `Automated test runner reported ${input.failingTestsCount} failing assertion(s).`,
        blocking: true
      });
    }

    for (const tf of input.testFailures || []) {
      findings.push({
        id: `crit-tf-${findings.length + 1}`,
        category: 'CRITICAL_DEFECT',
        title: 'Test Assertion Failure',
        filePath: input.targetFiles?.[0] || 'test_suite',
        evidence: tf,
        blocking: true
      });
    }
  }

  private collectRuntimeDefects(input: TriageInput, findings: TriageFinding[]): void {
    for (const ee of input.engineErrors || []) {
      if (/crash|null|exception|assert|fail|error/i.test(ee)) {
        findings.push({
          id: `crit-eng-${findings.length + 1}`,
          category: 'CRITICAL_DEFECT',
          title: 'Engine Runtime Crash / Error',
          filePath: input.targetFiles?.[0] || 'engine_runtime',
          evidence: ee,
          blocking: true
        });
      }
    }

    for (const se of input.syntaxErrors || []) {
      findings.push({
        id: `crit-syn-${findings.length + 1}`,
        category: 'CRITICAL_DEFECT',
        title: 'Syntax / Compilation Failure',
        filePath: input.targetFiles?.[0] || 'source',
        evidence: se,
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
      'GD_005_RESOURCE_LEAK'
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
