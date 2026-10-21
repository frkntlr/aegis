import type { CageValidationResult, CageViolation } from '@aegis/shared';

export interface CageValidatorOptions {
  maxFunctionLines?: number;
  maxFileLines?: number;
  maxCyclomaticComplexity?: number;
}

export class IronCageValidator {
  private maxFunctionLines: number;
  private maxFileLines: number;

  constructor(options: CageValidatorOptions = {}) {
    this.maxFunctionLines = options.maxFunctionLines ?? 40;
    this.maxFileLines = options.maxFileLines ?? 300;
  }

  public validateFileContent(filePath: string, content: string): CageValidationResult {
    const violations: CageViolation[] = [];
    const lines = content.split('\n');

    // Rule 1: Max file lines
    if (lines.length > this.maxFileLines) {
      violations.push({
        rule: 'MAX_FILE_LINES',
        filePath,
        message: `File exceeds maximum length of ${this.maxFileLines} lines (actual: ${lines.length} lines).`,
        severity: 'error'
      });
    }

    // Rule 2: Approximate function lines scanner
    let inFunction = false;
    let funcStartLine = 0;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Simple heuristic for function start
      if (!inFunction && (trimmed.startsWith('function ') || trimmed.includes('=> {') || trimmed.match(/^(async\s+)?(public\s+|private\s+|protected\s+)?\w+\s*\([^)]*\)\s*[:\w<>\s]*\{/))) {
        inFunction = true;
        funcStartLine = i + 1;
        braceDepth = 0;
      }

      if (inFunction) {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }

        if (braceDepth <= 0 && line.includes('}')) {
          const funcLength = (i + 1) - funcStartLine + 1;
          if (funcLength > this.maxFunctionLines) {
            violations.push({
              rule: 'MAX_FUNCTION_LINES',
              filePath,
              line: funcStartLine,
              message: `Function starting at line ${funcStartLine} exceeds ${this.maxFunctionLines} lines (actual: ${funcLength} lines).`,
              severity: 'error'
            });
          }
          inFunction = false;
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      scannedFilesCount: 1
    };
  }

  public validateDiff(filePath: string, addedCount: number, deletedCount: number, totalLines: number): CageValidationResult {
    const violations: CageViolation[] = [];

    // If more than 80% of the entire file was rewritten at once on an existing file
    if (totalLines > 50 && (addedCount + deletedCount) > (totalLines * 1.5)) {
      violations.push({
        rule: 'FULL_FILE_REWRITE',
        filePath,
        message: `Full-file rewrite detected (${addedCount} added, ${deletedCount} deleted out of ${totalLines} lines). Only surgical Unified Diffs are allowed under the Aegis Constitution.`,
        severity: 'error'
      });
    }

    return {
      passed: violations.length === 0,
      violations,
      scannedFilesCount: 1
    };
  }
}
