import type { TrustAuditReport } from '@aegis/shared';

export interface AuditInput {
  modifiedFiles: string[];
  newTestContents?: { filePath: string; content: string }[];
  reportedPassedCount: number;
  reportedFailedCount: number;
}

export class ImmutableOracle {
  public audit(input: AuditInput): TrustAuditReport {
    const details: string[] = [];
    const tamperedTestFiles: string[] = [];
    let vacuousAssertionsFound = 0;

    // Check 1: Test Tampering Detection
    for (const file of input.modifiedFiles) {
      if (file.match(/\.(test|spec)\.(ts|js|jsx|tsx|py)$/) || file.includes('__tests__')) {
        tamperedTestFiles.push(file);
        details.push(`Suspicious: Existing test file was modified by agent: ${file}`);
      }
    }

    // Check 2: Vacuous Assertion Detection
    if (input.newTestContents) {
      for (const { filePath, content } of input.newTestContents) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          // Heuristic patterns for vacuous tests:
          // expect(true).toBe(true), expect(x).toBe(x), assert.equal(1, 1), etc.
          if (line.match(/expect\(([^)]+)\)\.(toBe|toEqual)\(\1\)/) ||
              line.match(/assert\.(strictEqual|equal)\(([^,]+),\s*\2\)/) ||
              line.includes('expect(true).toBe(true)')) {
            vacuousAssertionsFound++;
            details.push(`Vacuous assertion detected in ${filePath} at line ${i + 1}: "${line}"`);
          }
        }
      }
    }

    // Check 3: Self-Report vs Reality Check
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
      mutationScorePercent: 100, // baseline
      verdict,
      details
    };
  }
}
