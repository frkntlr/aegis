import ts from 'typescript';
import type { CageViolation } from '@aegis/shared';

export interface AntiSpaghettiOptions {
  maxCyclomaticComplexity?: number;
  maxParams?: number;
  maxClassMethods?: number;
  maxFileImports?: number;
}

type CallableNode =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

function isNestedCallable(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function isCallableNode(node: ts.Node): node is CallableNode {
  return isNestedCallable(node);
}

function isBranchOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.AmpersandAmpersandToken ||
    kind === ts.SyntaxKind.BarBarToken ||
    kind === ts.SyntaxKind.QuestionQuestionToken
  );
}

function isComplexityPoint(node: ts.Node): boolean {
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node)
  ) {
    return true;
  }
  return ts.isBinaryExpression(node) && isBranchOperator(node.operatorToken.kind);
}

export function calculateCyclomaticComplexity(node: ts.Node): number {
  let complexity = 1;

  const visit = (current: ts.Node): void => {
    if (current !== node && isNestedCallable(current)) {
      return;
    }
    if (current !== node && isComplexityPoint(current)) {
      complexity += 1;
    }
    ts.forEachChild(current, visit);
  };

  visit(node);
  return complexity;
}

function resolveCallableName(node: CallableNode): string {
  if ('name' in node && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
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

function countParameters(node: CallableNode): number {
  return node.parameters.filter((param) => {
    return !(ts.isIdentifier(param.name) && param.name.text === 'this');
  }).length;
}

export class AntiSpaghettiValidator {
  private readonly maxCyclomaticComplexity: number;
  private readonly maxParams: number;
  private readonly maxClassMethods: number;
  private readonly maxFileImports: number;

  constructor(options: AntiSpaghettiOptions = {}) {
    this.maxCyclomaticComplexity = options.maxCyclomaticComplexity ?? 15;
    this.maxParams = options.maxParams ?? 5;
    this.maxClassMethods = options.maxClassMethods ?? 12;
    this.maxFileImports = options.maxFileImports ?? 10;
  }

  public validate(filePath: string, content: string): CageViolation[] {
    const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    return this.validateSourceFile(filePath, sf);
  }

  public validateSourceFile(filePath: string, sf: ts.SourceFile): CageViolation[] {
    const violations: CageViolation[] = [];
    this.checkFileImports(filePath, sf, violations);

    const walk = (node: ts.Node): void => {
      this.inspectNode(node, sf, filePath, violations);
      ts.forEachChild(node, walk);
    };

    walk(sf);
    return violations;
  }

  private checkFileImports(filePath: string, sf: ts.SourceFile, violations: CageViolation[]): void {
    const imports = sf.statements.filter(ts.isImportDeclaration);
    if (imports.length <= this.maxFileImports) return;

    const line = sf.getLineAndCharacterOfPosition(imports[0].getStart(sf)).line + 1;
    violations.push({
      rule: 'ARCH_001_HIGH_FAN_OUT',
      filePath,
      line,
      message: `File imports ${imports.length} modules, exceeding high fan-out threshold (${this.maxFileImports}). Consider decomposing responsibilities.`,
      severity: 'warning'
    });
  }

  private inspectNode(node: ts.Node, sf: ts.SourceFile, filePath: string, violations: CageViolation[]): void {
    if (isCallableNode(node)) {
      this.checkCallable(node, sf, filePath, violations);
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      this.checkClass(node, sf, filePath, violations);
    }
  }

  private checkCallable(
    node: CallableNode,
    sf: ts.SourceFile,
    filePath: string,
    violations: CageViolation[]
  ): void {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const name = resolveCallableName(node);
    const complexity = calculateCyclomaticComplexity(node);
    if (complexity > this.maxCyclomaticComplexity) {
      violations.push({
        rule: 'CYCLOMATIC_COMPLEXITY',
        filePath,
        line,
        message: `Function '${name}' has cyclomatic complexity ${complexity}, exceeding maximum ${this.maxCyclomaticComplexity}.`,
        severity: 'error'
      });
    }
    const paramCount = countParameters(node);
    if (paramCount > this.maxParams) {
      violations.push({
        rule: 'TS_004_MAX_PARAMS',
        filePath,
        line,
        message: `Function '${name}' takes ${paramCount} parameters, exceeding threshold (${this.maxParams}). Group into an options object.`,
        severity: 'warning'
      });
    }
  }

  private checkClass(
    node: ts.ClassDeclaration | ts.ClassExpression,
    sf: ts.SourceFile,
    filePath: string,
    violations: CageViolation[]
  ): void {
    const methodCount = node.members.filter(ts.isMethodDeclaration).length;
    if (methodCount <= this.maxClassMethods) return;

    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const className = node.name?.text ?? 'anonymous class';
    violations.push({
      rule: 'TS_005_GOD_CLASS',
      filePath,
      line,
      message: `Class '${className}' defines ${methodCount} methods, exceeding God Class threshold (${this.maxClassMethods}). Split into focused delegates.`,
      severity: 'warning'
    });
  }
}
