import ts from 'typescript';
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

  private isCallableNode(node: ts.Node): boolean {
    return (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    );
  }

  private resolveCallableName(node: ts.Node): string {
    const namedNode = node as { name?: ts.PropertyName | ts.BindingName };
    if (namedNode.name && ts.isIdentifier(namedNode.name)) {
      return namedNode.name.text;
    }
    const parent = node.parent;
    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isConstructorDeclaration(node)) return 'constructor';
    if (ts.isArrowFunction(node)) return 'arrow function';
    return 'anonymous function';
  }

  private inspectFunctionNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    violations: CageViolation[]
  ): void {
    if (!this.isCallableNode(node)) return;

    const startPos = node.getStart(sourceFile);
    const endPos = node.getEnd();
    const { line: startLine0 } = sourceFile.getLineAndCharacterOfPosition(startPos);
    const { line: endLine0 } = sourceFile.getLineAndCharacterOfPosition(endPos);

    const startLine = startLine0 + 1;
    const funcLength = endLine0 - startLine0 + 1;

    if (funcLength > this.maxFunctionLines) {
      const name = this.resolveCallableName(node);
      violations.push({
        rule: 'MAX_FUNCTION_LINES',
        filePath,
        line: startLine,
        message: `Function '${name}' starting at line ${startLine} exceeds ${this.maxFunctionLines} lines (actual: ${funcLength} lines).`,
        severity: 'error'
      });
    }
  }

  private validateTypeScriptAst(filePath: string, content: string, violations: CageViolation[]): void {
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    const walk = (node: ts.Node) => {
      this.inspectFunctionNode(node, sourceFile, filePath, violations);
      ts.forEachChild(node, walk);
    };

    walk(sourceFile);
  }

  private checkFunctionLimit(
    funcStart: number,
    funcLength: number,
    filePath: string,
    violations: CageViolation[]
  ): void {
    if (funcLength > this.maxFunctionLines) {
      violations.push({
        rule: 'MAX_FUNCTION_LINES',
        filePath,
        line: funcStart,
        message: `Function starting at line ${funcStart} exceeds ${this.maxFunctionLines} lines (actual: ${funcLength} lines).`,
        severity: 'error'
      });
    }
  }

  private isLineFunctionStart(trimmed: string): boolean {
    const stripped = trimmed.replace(/^export\s+(default\s+)?/, '');
    const fnRegex = new RegExp('^(public\\s+|private\\s+|protected\\s+|static\\s+)*(async\\s+)?\\w+\\s*\\([^)]*\\)\\s*[:\\w<>\\s]*\\{?');
    const arrowMarker = '=' + '> ' + '{';
    return stripped.startsWith('function ') ||
      stripped.startsWith('async function ') ||
      stripped.startsWith('func ') ||
      stripped.startsWith('func(') ||
      stripped.startsWith('fn ') ||
      stripped.startsWith('pub fn ') ||
      stripped.startsWith('async fn ') ||
      trimmed.includes(arrowMarker) ||
      Boolean(stripped.match(fnRegex));
  }

  private updateBraces(line: string, state: ScanState, i: number, violations: CageViolation[], filePath: string): void {
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
      this.checkFunctionLimit(state.funcStartLine, (i + 1) - state.funcStartLine + 1, filePath, violations);
      state.inFunction = false;
    }
  }

  private validateIndentationBased(filePath: string, lines: string[], violations: CageViolation[]): void {
    let inFunction = false;
    let funcStart = 0;
    let baseIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const isDef = trimmed.startsWith('def ') || trimmed.startsWith('async def ') ||
        trimmed.startsWith('func ') || trimmed.startsWith('static func ');
      const indent = (line.match(/^(\t|\s)*/)?.[0] ?? '').length;

      if (inFunction && indent <= baseIndent) {
        this.checkFunctionLimit(funcStart + 1, i - funcStart, filePath, violations);
        inFunction = false;
      }
      if (!inFunction && isDef) {
        inFunction = true;
        funcStart = i;
        baseIndent = indent;
      }
    }
    if (inFunction) {
      this.checkFunctionLimit(funcStart + 1, lines.length - funcStart, filePath, violations);
    }
  }

  private validateLineBased(filePath: string, lines: string[], violations: CageViolation[]): void {
    const state: ScanState = { inFunction: false, funcStartLine: 0, braceDepth: 0 };
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!state.inFunction && this.isLineFunctionStart(trimmed)) {
        state.inFunction = true;
        state.funcStartLine = i + 1;
        state.braceDepth = 0;
      }
      if (state.inFunction) {
        this.updateBraces(lines[i], state, i, violations, filePath);
      }
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

    const isTsOrJs = /\.[jt]sx?$/i.test(filePath);
    const isIndentBased = /\.(py|gd)$/i.test(filePath);

    if (isTsOrJs) {
      try {
        this.validateTypeScriptAst(filePath, content, violations);
      } catch {
        this.validateLineBased(filePath, lines, violations);
      }
    } else if (isIndentBased) {
      this.validateIndentationBased(filePath, lines, violations);
    } else {
      this.validateLineBased(filePath, lines, violations);
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
