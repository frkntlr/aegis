/**
 * Test Fidelity Auditor
 * Anti-hallucination auditor: detects hollow mocks, empty test blocks, vacuous literals,
 * commented-out assertions, and scope deviations.
 * Demir Kafes compliant: max 300 lines/file, max 40 lines/function.
 */

export interface TestAuditTarget {
  filePath: string;
  content: string;
  isNew?: boolean;
}

export interface FidelityAuditResult {
  vacuousCount: number;
  emptyBlockCount: number;
  commentedAssertionCount: number;
  conditionalBypassCount: number;
  hollowMockCount: number;
  scopeViolations: string[];
  unlinkedNewTests: string[];
  assertionDensity: number;
  issues: string[];
  blockingCount: number;
}

export class TestFidelityAuditor {
  public static audit(
    testFiles: TestAuditTarget[],
    modifiedFiles: string[] = [],
    allowedScope?: string[]
  ): FidelityAuditResult {
    const issues: string[] = [];
    const scopeViolations = this.checkScope(testFiles, allowedScope, issues);
    let vacuousCount = 0;
    let emptyBlockCount = 0;
    let commentedCount = 0;
    let bypassCount = 0;
    let hollowMockCount = 0;
    let totalAssertions = 0;
    let totalTestBlocks = 0;

    for (const test of testFiles) {
      vacuousCount += this.checkVacuousLiterals(test, issues);
      commentedCount += this.checkCommentedAssertions(test, issues);
      bypassCount += this.checkConditionalBypasses(test, issues);
      hollowMockCount += this.checkHollowMocks(test, issues);
      const { blocks, assertions, emptyBlocks } = this.analyzeBlocksAndAssertions(test, issues);
      totalTestBlocks += blocks;
      totalAssertions += assertions;
      emptyBlockCount += emptyBlocks;
    }

    const unlinkedNewTests = this.checkUnlinkedTests(testFiles, modifiedFiles, issues);
    const density = totalTestBlocks > 0 ? Number((totalAssertions / totalTestBlocks).toFixed(2)) : 1.0;
    if (totalTestBlocks > 0 && density < 1.0) {
      issues.push(`Hollow test suite detected: assertion density (${density}) is below 1.0 assertion per test block.`);
    }

    const blockingCount = vacuousCount + emptyBlockCount + commentedCount + bypassCount + hollowMockCount + (density < 1.0 && totalTestBlocks > 0 ? 1 : 0);

    return {
      vacuousCount, emptyBlockCount, commentedAssertionCount: commentedCount,
      conditionalBypassCount: bypassCount, hollowMockCount, scopeViolations,
      unlinkedNewTests, assertionDensity: density, issues, blockingCount
    };
  }

  private static checkScope(files: TestAuditTarget[], allowedScope?: string[], issues: string[] = []): string[] {
    if (!allowedScope || allowedScope.length === 0) return [];
    const violations: string[] = [];
    for (const f of files) {
      const normalized = f.filePath.replace(/\\/g, '/');
      const inScope = allowedScope.some(s => normalized.includes(s.replace(/\\/g, '/')));
      if (!inScope) {
        violations.push(normalized);
        issues.push(`Scope violation: Test ${normalized} modified outside allowed scope.`);
      }
    }
    return violations;
  }

  private static checkVacuousLiterals(test: TestAuditTarget, issues: string[]): number {
    const lines = test.content.split('\n');
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('#')) continue;
      // expect("literal").toBeDefined() or expect(123).toBeDefined() (#208)
      const literalMatch = line.match(/expect\(\s*(['"`][^'"`]*['"`]|\d+|true|false|null|undefined)\s*\)\.(toBeDefined|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined)\(\)/);
      if (literalMatch) {
        count++;
        issues.push(`Vacuous literal assertion in ${test.filePath}:${i + 1}: "${line}"`);
      }
    }
    return count;
  }

  private static checkCommentedAssertions(test: TestAuditTarget, issues: string[]): number {
    const cleanNoComments = test.content.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*/g, '');
    const hasActiveAssertions = /\b(expect|assert(\.[a-zA-Z0-9_]+)?|assert_eq|assert_ne)\s*\(/i.test(cleanNoComments);
    const lines = test.content.split('\n');
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^\/\/\s*(expect|assert|assert_eq|assert_ne)\(/.test(line)) {
        if (test.isNew === false || !hasActiveAssertions) {
          count++;
          issues.push(`Commented-out assertion in ${test.filePath}:${i + 1}: fake pass suppression detected.`);
        }
      }
    }
    return count;
  }

  private static checkConditionalBypasses(test: TestAuditTarget, issues: string[]): number {
    let count = 0;
    const bypassRegex = /if\s*\(\s*(false|0|!true|dummy\s*===|false\s*===|null\s*!==\s*null)\s*\)\s*\{[^}]*(?:expect|assert)/g;
    if (bypassRegex.test(test.content)) {
      count++;
      issues.push(`Conditional assertion bypass detected in ${test.filePath}: assertion inside false branch.`);
    }
    return count;
  }

  private static checkHollowMocks(test: TestAuditTarget, issues: string[]): number {
    let count = 0;
    const hollowClassRegex = /class\s+Mock\w+\s*\{(?:\s*\w+\([^)]*\)\s*\{(?:\s*return\s+(?:null|undefined|\{\})?;?\s*|\s*)\}\s*)+\}/g;
    if (hollowClassRegex.test(test.content)) {
      count++;
      issues.push(`Hollow mock hallucination detected in ${test.filePath}: mock class contains only empty stubs.`);
    }
    return count;
  }

  private static analyzeBlocksAndAssertions(test: TestAuditTarget, issues: string[]): { blocks: number; assertions: number; emptyBlocks: number } {
    const blockMatches = test.content.match(/\b(it|test|func\s+test_\w+)\s*(\(|:)/g) || [];
    const cleanContent = test.content.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*/g, '');
    const assertionMatches = cleanContent.match(/\b(expect|assert\.[a-zA-Z0-9_]+|assert|assert_eq|assert_ne|assert_true|assert_false)\s*\(/g) || [];
    const blocks = blockMatches.length;
    const assertions = assertionMatches.length;
    let emptyBlocks = 0;

    if (blocks > 0 && assertions === 0) {
      emptyBlocks = blocks;
      issues.push(`Empty test block in ${test.filePath}: test suite has ${blocks} test(s) but 0 assertions.`);
    }
    return { blocks, assertions, emptyBlocks };
  }

  private static checkUnlinkedTests(tests: TestAuditTarget[], modifiedFiles: string[], issues: string[]): string[] {
    if (modifiedFiles.length === 0) return [];
    const unlinked: string[] = [];
    const prodBasenames = modifiedFiles
      .filter(f => !f.includes('.test.') && !f.includes('.spec.'))
      .map(f => f.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '')
      .filter(Boolean);

    if (prodBasenames.length === 0) return [];

    for (const test of tests) {
      if (test.isNew !== true) continue;
      const normalizedPath = test.filePath.replace(/\\/g, '/');
      const referencesAny = prodBasenames.some(base => test.content.includes(base) || normalizedPath.includes(base));
      if (!referencesAny) {
        unlinked.push(test.filePath);
        issues.push(`Unlinked test: New test ${test.filePath} does not reference any modified production symbol.`);
      }
    }
    return unlinked;
  }
}
