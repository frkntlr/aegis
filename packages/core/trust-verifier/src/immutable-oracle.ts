import type { TrustAuditReport } from '@aegis/shared';

export interface AuditInput {
  modifiedFiles: string[];
  newTestContents?: { filePath: string; content: string }[];
  reportedPassedCount: number;
  reportedFailedCount: number;
}

export class ImmutableOracle {
  private findTamperedTests(modifiedFiles: string[], details: string[]): string[] {
    const tamperedTestFiles: string[] = [];
    for (const file of modifiedFiles) {
      if (file.match(/\.(test|spec)\.(ts|js|jsx|tsx|py)$/) || file.includes('__tests__')) {
        tamperedTestFiles.push(file);
        details.push(`Suspicious: Existing test file was modified by agent: ${file}`);
      }
    }
    return tamperedTestFiles;
  }

  private countVacuousAssertions(newTestContents: { filePath: string; content: string }[] | undefined, details: string[]): number {
    if (!newTestContents) return 0;
    let count = 0;
    for (const { filePath, content } of newTestContents) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const isVacuous = line.match(/expect\(([^)]+)\)\.(toBe|toEqual)\(\1\)/) ||
          line.match(/assert\.(strictEqual|equal)\(([^,]+),\s*\2\)/) ||
          line.includes('expect(true).toBe(true)');
        if (isVacuous) {
          count++;
          details.push(`Vacuous assertion detected in ${filePath} at line ${i + 1}: "${line}"`);
        }
      }
    }
    return count;
  }

  public audit(input: AuditInput): TrustAuditReport {
    const details: string[] = [];
    const tamperedTestFiles = this.findTamperedTests(input.modifiedFiles, details);
    const vacuousAssertionsFound = this.countVacuousAssertions(input.newTestContents, details);

    if (input.reportedFailedCount > 0) {
      details.push(`Agent self-reported ${input.reportedFailedCount} failing tests. Cannot approve.`);
    }

    let verdict: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW_REQUIRED' = 'APPROVED';
    let suspicious = false;

    if (tamperedTestFiles.length > 0) {
      suspicious = true;
      verdict = 'MANUAL_REVIEW_REQUIRED';
    } else if (vacuousAssertionsFound > 0 || input.reportedFailedCount > 0) {
      suspicious = true;
      verdict = 'REJECTED';
    }

    return {
      suspicious,
      tamperedTestFiles,
      vacuousAssertionsFound,
      mutationScorePercent: 100,
      verdict,
      details
    };
  }
}
