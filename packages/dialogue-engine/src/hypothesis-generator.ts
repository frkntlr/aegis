import { ClarificationOption, DiagnosticCategory } from './types.js';
import { TriangulatedContext } from './ast-triangulator.js';
import { LineBudgetReport } from './ports/line-budget-inspector.js';
import { SymptomClassifier } from './classifier.js';

export class DynamicHypothesisGenerator {
  public static generate(
    category: DiagnosticCategory,
    triangulated?: TriangulatedContext,
    budget?: LineBudgetReport,
    boundaryOption?: ClarificationOption
  ): ClarificationOption[] {
    if (!triangulated && !boundaryOption) {
      return SymptomClassifier.getClarificationOptions(category);
    }

    const options: ClarificationOption[] = [];
    if (boundaryOption) options.push(boundaryOption);

    if (triangulated) {
      const sym = triangulated.slice?.symbolName || triangulated.location.symbolName || 'function';
      const file = triangulated.location.filePath;
      const line = triangulated.location.lineNumber;

      options.push(createDirectOption(sym, file, line));
      options.push(createAsyncOption(sym, file));

      if (budget && budget.remainingLines < 20) {
        options.push(createBudgetOption(file, budget.remainingLines));
      }
    }

    return options;
  }
}

function createDirectOption(sym: string, file: string, line: number): ClarificationOption {
  return {
    id: 'hyp-direct',
    label: `${sym}(): Unhandled null/undefined parameter at ${file}:${line}`,
    hypothesisKey: 'NULL_DEREFERENCE',
    microProbeCommand: `npm test -- -t "${sym}"`,
    confidenceScore: 0.90
  };
}

function createAsyncOption(sym: string, file: string): ClarificationOption {
  return {
    id: 'hyp-async',
    label: `${sym}(): Unhandled async rejection or callee contract breach in downstream invocation`,
    hypothesisKey: 'CALLEE_EXCEPTION',
    microProbeCommand: `node packages/cli/dist/bin/aegis.js verify ${file}`,
    confidenceScore: 0.75
  };
}

function createBudgetOption(file: string, remainingLines: number): ClarificationOption {
  return {
    id: 'hyp-budget',
    label: `${file}: Demir Kafes quota critical (${remainingLines} lines remaining) - Decomposition required`,
    hypothesisKey: 'LINE_BUDGET_OVERFLOW',
    microProbeCommand: 'node packages/cli/dist/bin/aegis.js cage:check',
    confidenceScore: 0.95
  };
}
