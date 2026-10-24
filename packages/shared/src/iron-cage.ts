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
  | 'GD_006_CYCLOMATIC_COMPLEXITY'
  | 'GD_007_COUPLING_PARENT_NODE'
  | 'GD_008_TYPED_GDSCRIPT'
  | 'GD_009_BAND_AID_PREVENTION'
  | 'TS_001_NO_ANY'
  | 'TS_002_EMPTY_CATCH'
  | 'TS_003_NESTING_DEPTH';

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
