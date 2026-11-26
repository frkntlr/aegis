import ts from 'typescript';
import type { CageValidationResult, CageViolation } from '@aegis/shared';
import { GDScriptRulesValidator } from './gdscript-rules.js';
import { CleanArchitectureValidator } from './clean-architecture-rules.js';
import { AntiSpaghettiValidator } from './anti-spaghetti-rules.js';
import { validateIndentationBased, validateLineBased } from './cage-fallback-scanners.js';

export interface CageValidatorOptions {
  maxFunctionLines?: number;
  maxFileLines?: number;
  maxCyclomaticComplexity?: number;
}

export class IronCageValidator {
  private maxFunctionLines: number;
  private maxFileLines: number;
  private maxCyclomaticComplexity: number;

  constructor(options: CageValidatorOptions = {}) {
    this.maxFunctionLines = options.maxFunctionLines ?? 40;
    this.maxFileLines = options.maxFileLines ?? 300;
    this.maxCyclomaticComplexity = options.maxCyclomaticComplexity ?? 35;
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

    const antiSpaghetti = new AntiSpaghettiValidator({
      maxCyclomaticComplexity: this.maxCyclomaticComplexity,
      maxParams: Number.MAX_SAFE_INTEGER,
      maxClassMethods: Number.MAX_SAFE_INTEGER,
      maxFileImports: Number.MAX_SAFE_INTEGER
    });
    violations.push(...antiSpaghetti.validateSourceFile(filePath, sourceFile));
  }

  private validateNonGdScript(filePath: string, content: string, lines: string[], violations: CageViolation[]): void {
    if (lines.length > this.maxFileLines) {
      violations.push({
        rule: 'MAX_FILE_LINES',
        filePath,
        message: `File exceeds maximum length of ${this.maxFileLines} lines (actual: ${lines.length} lines).`,
        severity: 'error'
      });
    }

    const fallbackCtx = { filePath, maxFunctionLines: this.maxFunctionLines, violations };
    if (/\.[jt]sx?$/i.test(filePath)) {
      try {
        this.validateTypeScriptAst(filePath, content, violations);
        violations.push(...new CleanArchitectureValidator().validate(filePath, content));
      } catch {
        // Fallback to brace-based scanning if TS AST parsing fails
        validateLineBased(lines, fallbackCtx);
      }
    } else if (/\.py$/i.test(filePath)) {
      validateIndentationBased(lines, fallbackCtx);
    } else {
      validateLineBased(lines, fallbackCtx);
    }
  }

  public validateFileContent(filePath: string, content: string): CageValidationResult {
    const violations: CageViolation[] = [];
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : (normalized ? normalized.split('\n') : []);

    if (filePath.endsWith('.gd')) {
      const gdViolations = new GDScriptRulesValidator({
        maxFunctionLines: this.maxFunctionLines,
        maxFileLines: this.maxFileLines
      }).validate(filePath, normalized);
      violations.push(...gdViolations);
    } else {
      this.validateNonGdScript(filePath, normalized, lines, violations);
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
