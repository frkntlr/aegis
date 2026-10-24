import ts from 'typescript';
import type { CageViolation } from '@aegis/shared';

export interface CleanArchitectureOptions {
  maxNestingDepth?: number;
}

export class CleanArchitectureValidator {
  private maxNestingDepth: number;

  constructor(options: CleanArchitectureOptions = {}) {
    this.maxNestingDepth = options.maxNestingDepth ?? 4;
  }

  public validate(filePath: string, content: string): CageViolation[] {
    const violations: CageViolation[] = [];
    const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    const walk = (node: ts.Node, depth: number) => {
      this.checkNoAny(node, sf, filePath, violations);
      this.checkEmptyCatch(node, sf, filePath, content, violations);

      const isBranch =
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isSwitchStatement(node);

      const shouldIncrement = isBranch && !this.isElseIf(node);
      const nextDepth = shouldIncrement ? depth + 1 : this.isFunctionBoundary(node) ? 0 : depth;
      if (shouldIncrement && nextDepth > this.maxNestingDepth) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        violations.push({
          rule: 'TS_003_NESTING_DEPTH',
          filePath,
          line,
          message: `Control flow nesting depth of ${nextDepth} exceeds threshold (${this.maxNestingDepth}). Refactor with guard clauses.`,
          severity: 'warning'
        });
      }

      ts.forEachChild(node, c => walk(c, nextDepth));
    };

    walk(sf, 0);
    return violations;
  }

  private isElseIf(node: ts.Node): boolean {
    return Boolean(
      ts.isIfStatement(node) &&
      node.parent &&
      ts.isIfStatement(node.parent) &&
      node.parent.elseStatement === node
    );
  }

  private isFunctionBoundary(node: ts.Node): boolean {
    return (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    );
  }

  private checkNoAny(node: ts.Node, sf: ts.SourceFile, filePath: string, violations: CageViolation[]): void {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      violations.push({
        rule: 'TS_001_NO_ANY',
        filePath,
        line,
        message: "Explicit 'any' type is prohibited. Use strict domain types or 'unknown' with type narrowing.",
        severity: 'error'
      });
    }
  }

  private checkEmptyCatch(
    node: ts.Node,
    sf: ts.SourceFile,
    filePath: string,
    content: string,
    violations: CageViolation[]
  ): void {
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      const blockText = content.slice(node.block.getStart(sf), node.block.getEnd());
      if (!blockText.includes('/*') && !blockText.includes('//')) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        violations.push({
          rule: 'TS_002_EMPTY_CATCH',
          filePath,
          line,
          message: 'Empty catch block detected. Swallowing exceptions without handling or documented reason is prohibited.',
          severity: 'error'
        });
      }
    }
  }
}
