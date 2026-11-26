import type { CageViolation } from '@aegis/shared';
import type { GDScriptFuncBlock } from './gdscript-constants.js';
import {
  checkBandAidPrevention,
  checkOnreadySafety,
  checkParentCoupling,
  checkSignalUsage,
  checkTypedGDScript,
  extractGDScriptFunctions,
  findDeclaredSignals,
  hasNodeInstantiation,
  hasRetentionOrCleanup
} from './gdscript-rule-checks.js';

export interface GDScriptRulesOptions {
  maxFunctionLines?: number;
  maxFileLines?: number;
  maxComplexity?: number;
}

export class GDScriptRulesValidator {
  private maxFunctionLines: number;
  private maxFileLines: number;
  private maxComplexity: number;

  constructor(options: GDScriptRulesOptions = {}) {
    this.maxFunctionLines = options.maxFunctionLines ?? 40;
    this.maxFileLines = options.maxFileLines ?? 300;
    this.maxComplexity = options.maxComplexity ?? 10;
  }

  public validate(filePath: string, content: string): CageViolation[] {
    const violations: CageViolation[] = [];
    const lines = content.split(/\r?\n/);

    this.checkFileLength(filePath, lines.length, violations);
    const declaredSignals = findDeclaredSignals(lines);
    const functions = extractGDScriptFunctions(lines);

    for (const fn of functions) {
      this.checkFunctionLength(filePath, fn, violations);
      this.checkComplexity(filePath, fn, violations);
      this.checkResourceLeaks(filePath, fn, violations);
      checkSignalUsage(filePath, fn, declaredSignals, violations);
      checkTypedGDScript(filePath, fn, violations);
    }

    checkOnreadySafety(filePath, lines, violations);
    checkParentCoupling(filePath, lines, violations);
    checkBandAidPrevention(filePath, lines, violations);
    return violations;
  }

  private checkFileLength(filePath: string, count: number, violations: CageViolation[]): void {
    if (count > this.maxFileLines) {
      violations.push({
        rule: 'GD_002_FILE_LENGTH',
        filePath,
        message: `GDScript exceeds ${this.maxFileLines} lines (actual: ${count}).`,
        severity: 'error'
      });
    }
  }

  private checkFunctionLength(filePath: string, fn: GDScriptFuncBlock, violations: CageViolation[]): void {
    if (fn.lines.length > this.maxFunctionLines) {
      violations.push({
        rule: 'GD_001_FUNC_LENGTH',
        filePath,
        line: fn.startLine,
        message: `Function '${fn.name}' exceeds ${this.maxFunctionLines} lines (actual: ${fn.lines.length}).`,
        severity: 'error'
      });
    }
  }

  private checkComplexity(filePath: string, fn: GDScriptFuncBlock, violations: CageViolation[]): void {
    let score = 1;
    const branchKeywords = /\b(if|elif|for|while|match|and|or)\b/;
    for (const l of fn.lines) {
      const stripped = l.replace(/#.*$/, '');
      const matches = stripped.match(new RegExp(branchKeywords, 'g'));
      if (matches) score += matches.length;
    }
    if (score > this.maxComplexity) {
      violations.push({
        rule: 'GD_006_CYCLOMATIC_COMPLEXITY',
        filePath,
        line: fn.startLine,
        message: `Function '${fn.name}' has cyclomatic complexity ${score} (max: ${this.maxComplexity}).`,
        severity: 'error'
      });
    }
  }

  private checkResourceLeaks(filePath: string, fn: GDScriptFuncBlock, violations: CageViolation[]): void {
    const text = fn.lines.join('\n');
    if (hasNodeInstantiation(text) && !hasRetentionOrCleanup(text)) {
      violations.push({
        rule: 'GD_005_RESOURCE_LEAK',
        filePath,
        line: fn.startLine,
        message: `Function '${fn.name}' instantiates a node without add_child(), queue_free(), or retaining it.`,
        severity: 'warning'
      });
    }
  }
}
