export interface DiffBudgetReport {
  fileLines: number;
  maxFileLines: number;
  fileQuotaRemaining: number;
  fileExceeded: boolean;
  funcLines?: number;
  maxFunctionLines?: number;
  funcQuotaRemaining?: number;
  funcExceeded?: boolean;
  isExceeded: boolean;
  directive?: string;
  formattedWarning: string;
}

export interface DiffBudgetCheckResult {
  allowed: boolean;
  newFileLines: number;
  fileAllowed: boolean;
  newFuncLines?: number;
  funcAllowed?: boolean;
  reason?: string;
}

export interface DiffBudgetOptions {
  maxFileLines?: number;
  maxFunctionLines?: number;
}

export class PreEmptiveDiffBudgeting {
  public static readonly DEFAULT_MAX_FILE_LINES = 300;
  public static readonly DEFAULT_MAX_FUNCTION_LINES = 40;

  public static calculateBudget(
    fileLines: number,
    funcLines?: number,
    options: DiffBudgetOptions = {}
  ): DiffBudgetReport {
    const maxFile = options.maxFileLines ?? PreEmptiveDiffBudgeting.DEFAULT_MAX_FILE_LINES;
    const maxFunc = options.maxFunctionLines ?? PreEmptiveDiffBudgeting.DEFAULT_MAX_FUNCTION_LINES;
    const fileQuota = Math.max(0, maxFile - fileLines);
    const fileExceeded = fileLines >= maxFile;

    const funcBudget = PreEmptiveDiffBudgeting.calcFuncBudget(funcLines, maxFunc);
    const isExceeded = fileExceeded || Boolean(funcBudget.exceeded);
    const directive = PreEmptiveDiffBudgeting.resolveDirective(fileLines, maxFile, funcLines, maxFunc);
    const formattedWarning = PreEmptiveDiffBudgeting.buildWarningString(fileLines, maxFile, fileQuota, funcBudget, directive);

    return {
      fileLines,
      maxFileLines: maxFile,
      fileQuotaRemaining: fileQuota,
      fileExceeded,
      funcLines,
      maxFunctionLines: maxFunc,
      funcQuotaRemaining: funcBudget.quota,
      funcExceeded: funcBudget.exceeded,
      isExceeded,
      directive,
      formattedWarning
    };
  }

  private static calcFuncBudget(funcLines?: number, maxFunc = 40): { quota?: number; exceeded?: boolean } {
    if (funcLines === undefined) return {};
    return {
      quota: Math.max(0, maxFunc - funcLines),
      exceeded: funcLines >= maxFunc
    };
  }

  private static resolveDirective(fLines: number, maxF: number, fnLines?: number, maxFn = 40): string | undefined {
    if (fLines >= maxF) {
      return `⚠️ KOTA DOLDU: Dosya ${fLines}/${maxF} satır sınırına ulaştı. Doğrudan yeni kod eklemek yasaktır; yeni bir yardımcı modüle refactor etmeniz zorunludur.`;
    }
    if (fnLines !== undefined && fnLines >= maxFn) {
      return `⚠️ KOTA DOLDU: Fonksiyon ${fnLines}/${maxFn} satır sınırına ulaştı. Doğrudan kod eklemek yasaktır; alt fonksiyonlara bölmeniz zorunludur.`;
    }
    return undefined;
  }

  private static buildWarningString(
    fLines: number,
    maxF: number,
    fQuota: number,
    funcBudget: { quota?: number; exceeded?: boolean },
    directive?: string
  ): string {
    const lines = [
      '🛡️ Demir Kafes Proaktif Kotası:',
      `   - Hedef Dosya: ${fLines} satır (Azami Tavan: ${maxF}) -> Bu dosyaya EN FAZLA ${fQuota} satır ekleyebilirsiniz!`
    ];
    if (funcBudget.quota !== undefined) {
      lines.push(
        `   - Hedef Fonksiyon: ${PreEmptiveDiffBudgeting.DEFAULT_MAX_FUNCTION_LINES - funcBudget.quota} satır (Azami Tavan: ${PreEmptiveDiffBudgeting.DEFAULT_MAX_FUNCTION_LINES}) -> Bu fonksiyona EN FAZLA ${funcBudget.quota} satır ekleyebilirsiniz!`
      );
    }
    if (directive) lines.push(`   ${directive}`);
    return lines.join('\n');
  }

  public static formatWarningForSlice(
    fileLines: number,
    funcLines?: number,
    commentPrefix = '//',
    options: DiffBudgetOptions = {}
  ): string {
    const budget = PreEmptiveDiffBudgeting.calculateBudget(fileLines, funcLines, options);
    return budget.formattedWarning
      .split('\n')
      .map(line => `${commentPrefix} ${line}`)
      .join('\n');
  }

  public static assessProposedDiff(
    fileLines: number,
    addedLines: number,
    removedLines: number,
    funcLines?: number,
    funcAddedLines?: number,
    funcRemovedLines?: number,
    options: DiffBudgetOptions = {}
  ): DiffBudgetCheckResult {
    const maxF = options.maxFileLines ?? PreEmptiveDiffBudgeting.DEFAULT_MAX_FILE_LINES;
    const maxFn = options.maxFunctionLines ?? PreEmptiveDiffBudgeting.DEFAULT_MAX_FUNCTION_LINES;
    const newFileLines = fileLines + addedLines - removedLines;
    const fileAllowed = newFileLines <= maxF;

    if (funcLines !== undefined) {
      const newFuncLines = funcLines + (funcAddedLines ?? 0) - (funcRemovedLines ?? 0);
      const funcAllowed = newFuncLines <= maxFn;
      const allowed = fileAllowed && funcAllowed;
      const reason = !allowed
        ? `Diff exceeds Demir Kafes: file=${newFileLines}/${maxF}, func=${newFuncLines}/${maxFn}`
        : undefined;
      return { allowed, newFileLines, fileAllowed, newFuncLines, funcAllowed, reason };
    }

    return {
      allowed: fileAllowed,
      newFileLines,
      fileAllowed,
      reason: !fileAllowed ? `Diff exceeds Demir Kafes: file=${newFileLines}/${maxF}` : undefined
    };
  }
}
