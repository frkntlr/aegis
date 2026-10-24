export type CageRuleType =
  | 'MAX_FUNCTION_LINES'
  | 'MAX_FILE_LINES'
  | 'CYCLOMATIC_COMPLEXITY'
  | 'DEAD_CODE'
  | 'FULL_FILE_REWRITE'
  | 'NO_TESTS'
  | 'GD_001_FUNC_LENGTH'
  | 'GD_002_FILE_LENGTH'
  | 'GD_003_ONREADY_SAFETY'
  | 'GD_004_SIGNAL_SAFETY'
  | 'GD_005_RESOURCE_LEAK'
  | 'GD_006_CYCLOMATIC_COMPLEXITY';

export interface CageViolation {
  rule: CageRuleType;
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
