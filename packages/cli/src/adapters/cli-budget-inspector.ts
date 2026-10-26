import * as fs from 'node:fs';
import {
  ILineBudgetInspector,
  LineBudgetReport
} from '@aegis/dialogue-engine';
import { LineBudgetRadar } from '@aegis/iron-cage';

export class CliLineBudgetInspector implements ILineBudgetInspector {
  private maxFileLines: number;

  constructor(maxFileLines = LineBudgetRadar.DEFAULT_MAX_FILE_LINES) {
    this.maxFileLines = maxFileLines;
  }

  public async inspectBudget(filePath: string): Promise<LineBudgetReport> {
    if (!fs.existsSync(filePath)) {
      return {
        filePath,
        currentLines: 0,
        maxLines: this.maxFileLines,
        remainingLines: this.maxFileLines,
        mustDecompose: false,
        recommendation: 'New file. Line budget quota fully available.'
      };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const analysis = LineBudgetRadar.analyze(filePath, content, this.maxFileLines);
      const mustDecompose = analysis.fileQuotaRemaining < 15 ||
        analysis.status === 'CRITICAL_QUOTA' ||
        analysis.status === 'EXCEEDED';

      return {
        filePath,
        currentLines: analysis.fileLines,
        maxLines: analysis.maxFileLines,
        remainingLines: analysis.fileQuotaRemaining,
        mustDecompose,
        recommendation: analysis.advice?.recommendedAction ?? analysis.formattedReport
      };
    } catch {
      return {
        filePath,
        currentLines: 0,
        maxLines: this.maxFileLines,
        remainingLines: this.maxFileLines,
        mustDecompose: false
      };
    }
  }

  public checkCompliance(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return true;
    try {
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
      return lines <= this.maxFileLines;
    } catch {
      return true;
    }
  }
}
