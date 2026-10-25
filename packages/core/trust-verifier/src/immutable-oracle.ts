import type { TrustAuditReport } from '@aegis/shared';

export interface TestFileContent {
  filePath: string;
  content: string;
  isNew?: boolean;
}

export interface AuditInput {
  modifiedFiles: string[];
  newTestContents?: TestFileContent[];
  testContents?: TestFileContent[];
  createdFiles?: string[];
  reportedPassedCount: number;
  reportedFailedCount: number;
  mutationScorePercent?: number;
}

export class ImmutableOracle {
  private findTamperedTests(
    modifiedFiles: string[],
    newTestContents: TestFileContent[] | undefined,
    createdFiles: string[] | undefined,
    details: string[]
  ): string[] {
    const createdSet = new Set(createdFiles ?? []);
    if (newTestContents) {
      for (const t of newTestContents) {
        if (t.isNew !== false && (createdFiles ? createdSet.has(t.filePath) : true)) {
          createdSet.add(t.filePath);
        }
      }
    }

    const tamperedTestFiles: string[] = [];
    for (const rawFile of modifiedFiles) {
      const file = rawFile.replace(/\\/g, '/');
      if (createdSet.has(file) || createdSet.has(rawFile)) continue;
      const isTestFile =
        Boolean(file.match(/\.(test|spec)\.(ts|js|jsx|tsx|py|gd)$/)) ||
        Boolean(file.match(/(^|\/)test_[a-zA-Z0-9_]+\.(gd|py)$/)) ||
        Boolean(file.match(/(^|\/)[a-zA-Z0-9_]+_test\.(gd|py)$/)) ||
        file.includes('__tests__');
      if (isTestFile) {
        tamperedTestFiles.push(file);
        details.push(`Suspicious: Existing test file was modified by agent: ${file}`);
      }
    }
    return tamperedTestFiles;
  }

  private countVacuousAssertions(
    testContents: TestFileContent[] | undefined,
    details: string[]
  ): number {
    if (!testContents) return 0;
    let count = 0;
    for (const { filePath, content } of testContents) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(/^(\/\/|\/\*|\*|#)/)) continue;
        const isVacuous = line.match(/expect\(\s*([^()]+?)\s*\)\.(toBe|toEqual)\(\s*\1\s*\)/) ||
          line.match(/assert\.(strictEqual|equal|deepStrictEqual|deepEqual)\(\s*([^,()]+?)\s*,\s*\2\s*\)/) ||
          line.match(/assert_eq\(\s*([^,()]+?)\s*,\s*\1\s*\)/) ||
          line.match(/\bassert(\.ok)?\(\s*true\s*\)/) ||
          line.match(/\bassert\s+True\b/) ||
          line.includes('expect(true).toBe(true)') ||
          line.includes('assert_true(true)') ||
          line.includes('assert_false(false)');
        if (isVacuous) {
          count++;
          details.push(`Vacuous assertion detected in ${filePath} at line ${i + 1}: "${line}"`);
        }
      }
    }
    return count;
  }

  private determineVerdict(
    vacuous: number,
    failedCount: number,
    mutationScore: number,
    tamperedCount: number
  ): { suspicious: boolean; verdict: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW_REQUIRED' } {
    if (vacuous > 0 || failedCount > 0 || mutationScore < 70) {
      return { suspicious: true, verdict: 'REJECTED' };
    }
    if (tamperedCount > 0) {
      return { suspicious: true, verdict: 'MANUAL_REVIEW_REQUIRED' };
    }
    return { suspicious: false, verdict: 'APPROVED' };
  }

  public audit(input: AuditInput): TrustAuditReport {
    const details: string[] = [];
    const allTests = [...(input.testContents ?? []), ...(input.newTestContents ?? [])];
    const tamperedTestFiles = this.findTamperedTests(
      input.modifiedFiles,
      input.newTestContents,
      input.createdFiles,
      details
    );
    const vacuousAssertionsFound = this.countVacuousAssertions(
      allTests.length > 0 ? allTests : undefined,
      details
    );

    if (input.reportedFailedCount > 0) {
      details.push(`Agent self-reported ${input.reportedFailedCount} failing tests. Cannot approve.`);
    }

    const mutationScore = input.mutationScorePercent ?? 100;
    if (mutationScore < 70) {
      details.push(`Mutation score ${mutationScore}% is below required 70% threshold.`);
    }

    const { suspicious, verdict } = this.determineVerdict(
      vacuousAssertionsFound,
      input.reportedFailedCount,
      mutationScore,
      tamperedTestFiles.length
    );

    return {
      suspicious,
      tamperedTestFiles,
      vacuousAssertionsFound,
      mutationScorePercent: mutationScore,
      verdict,
      details
    };
  }
}
