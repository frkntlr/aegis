export interface LineBudgetReport {
  filePath: string;
  currentLines: number;
  maxLines: number;
  remainingLines: number;
  recommendation?: string;
  mustDecompose: boolean;
}

export interface ILineBudgetInspector {
  inspectBudget(filePath: string): Promise<LineBudgetReport>;
}
