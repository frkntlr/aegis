export interface CageViolation {
  rule: 'MAX_FUNCTION_LINES' | 'MAX_FILE_LINES' | 'CYCLOMATIC_COMPLEXITY' | 'DEAD_CODE' | 'FULL_FILE_REWRITE' | 'NO_TESTS';
  filePath: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface CageValidationResult {
  passed: boolean;
  violations: CageViolation[];
  scannedFilesCount: number;
}
