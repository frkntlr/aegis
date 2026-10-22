import type { CageValidationResult, CageViolation } from '@aegis/shared';

export interface CageValidatorOptions {
  maxFunctionLines?: number;
  maxFileLines?: number;
  maxCyclomaticComplexity?: number;
}

interface ScanState {
  inFunction: boolean;
  funcStartLine: number;
  braceDepth: number;
}

export class IronCageValidator {
  private maxFunctionLines: number;
  private maxFileLines: number;

  constructor(options: CageValidatorOptions = {}) {
    this.maxFunctionLines = options.maxFunctionLines ?? 40;
    this.maxFileLines = options.maxFileLines ?? 300;
  }

  private isFunctionStart(trimmed: string): boolean {
    const fnRegex = new RegExp('^(async\\s+)?(public\\s+|private\\s+|protected\\s+)?\\w+\\s*\\([^)]*\\)\\s*[:\\w<>\\s]*\\{');
    const arrowMarker = '=' + '> ' + '{';
    return trimmed.startsWith('function ') || trimmed.includes(arrowMarker) || Boolean(trimmed.match(fnRegex));
  }

  private updateBraces(line: string, state: ScanState, i: number, violations: CageViolation[], filePath: string): void {
    // Strip string literals and comments to avoid counting braces inside strings or regexes
    const cleanLine = line
      .replace(/"(\\.|[^"\\])*"/g, '""')
      .replace(/'(\\.|[^'\\])*'/g, "''")
      .replace(/`(\\.|[^`\\])*`/g, '``')
      .replace(/\/\/.*$/, '');

    for (const ch of cleanLine) {
      if (ch === '{') state.braceDepth++;
      if (ch === '}') state.braceDepth--;
    }

    if (state.braceDepth <= 0 && cleanLine.includes('}')) {
      const funcLength = (i + 1) - state.funcStartLine + 1;
      if (funcLength > this.maxFunctionLines) {
        violations.push({
          rule: 'MAX_FUNCTION_LINES',
          filePath,
          line: state.funcStartLine,
          message: `Function starting at line ${state.funcStartLine} exceeds ${this.maxFunctionLines} lines (actual: ${funcLength} lines).`,
          severity: 'error'
        });
      }
      state.inFunction = false;
    }
  }

  private scanLine(line: string, i: number, state: ScanState, violations: CageViolation[], filePath: string): void {
    const trimmed = line.trim();
    if (!state.inFunction && this.isFunctionStart(trimmed)) {
      state.inFunction = true;
      state.funcStartLine = i + 1;
      state.braceDepth = 0;
    }

    if (state.inFunction) {
      this.updateBraces(line, state, i, violations, filePath);
    }
  }

  public validateFileContent(filePath: string, content: string): CageValidationResult {
    const violations: CageViolation[] = [];
    const lines = content.split('\n');

    if (lines.length > this.maxFileLines) {
      violations.push({
        rule: 'MAX_FILE_LINES',
        filePath,
        message: `File exceeds maximum length of ${this.maxFileLines} lines (actual: ${lines.length} lines).`,
        severity: 'error'
      });
    }

    const state: ScanState = { inFunction: false, funcStartLine: 0, braceDepth: 0 };
    for (let i = 0; i < lines.length; i++) {
      this.scanLine(lines[i], i, state, violations, filePath);
    }

    return {
      passed: violations.length === 0,
      violations,
      scannedFilesCount: 1
    };
  }

  public validateDiff(filePath: string, addedCount: number, deletedCount: number, totalLines: number): CageValidationResult {
    const violations: CageViolation[] = [];
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
