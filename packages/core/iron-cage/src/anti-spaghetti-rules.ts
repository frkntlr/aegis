import ts from 'typescript';
import type { CageRuleType, CageViolation } from '@aegis/shared';

export interface AntiSpaghettiOptions {
  maxCyclomaticComplexity?: number;
  maxCognitiveComplexity?: number;
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

function isCallableNode(node: ts.Node): node is CallableNode {
  return (
    ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) || ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
  );
}

function isBranchOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.AmpersandAmpersandToken ||
    kind === ts.SyntaxKind.BarBarToken ||
    kind === ts.SyntaxKind.QuestionQuestionToken
  );
}

function isLoopOrCatchOrTernary(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) || ts.isDoStatement(node) ||
    ts.isCatchClause(node) || ts.isConditionalExpression(node)
  );
}

function isComplexityPoint(node: ts.Node): boolean {
  if (isLoopOrCatchOrTernary(node) || ts.isIfStatement(node) || ts.isCaseClause(node)) return true;
  return ts.isBinaryExpression(node) && isBranchOperator(node.operatorToken.kind);
}

export function calculateCyclomaticComplexity(node: ts.Node): number {
  let complexity = 1;
  const visit = (current: ts.Node): void => {
    if (current !== node && isCallableNode(current)) return;
    if (current !== node && isComplexityPoint(current)) complexity += 1;
    ts.forEachChild(current, visit);
  };
  visit(node);
  return complexity;
}

function isNewLogicalSequence(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node) || !isBranchOperator(node.operatorToken.kind)) return false;
  const { parent } = node;
  if (!parent || !ts.isBinaryExpression(parent)) return true;
  return parent.operatorToken.kind !== node.operatorToken.kind;
}

export function calculateCognitiveComplexity(node: ts.Node): number {
  let score = 0;

  const visitIf = (ifNode: ts.IfStatement, nesting: number): void => {
    const isElseIf = Boolean(ifNode.parent && ts.isIfStatement(ifNode.parent) && ifNode.parent.elseStatement === ifNode);
    score += isElseIf ? 1 : 1 + nesting;
    visit(ifNode.expression, nesting);
    visit(ifNode.thenStatement, nesting + 1);
    if (!ifNode.elseStatement) return;
    if (ts.isIfStatement(ifNode.elseStatement)) {
      visit(ifNode.elseStatement, nesting);
      return;
    }
    score += 1;
    visit(ifNode.elseStatement, nesting + 1);
  };

  const visit = (current: ts.Node, nesting: number): void => {
    if (current !== node && isCallableNode(current)) return;
    if (current !== node && ts.isIfStatement(current)) {
      visitIf(current, nesting);
      return;
    }
    if (current !== node && (isLoopOrCatchOrTernary(current) || ts.isSwitchStatement(current))) {
      score += 1 + nesting;
      ts.forEachChild(current, (child) => visit(child, nesting + 1));
      return;
    }
    if (current !== node && isNewLogicalSequence(current)) score += 1;
    ts.forEachChild(current, (child) => visit(child, nesting));
  };

  visit(node, 0);
  return score;
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

function countTypeArity(typeNode: ts.TypeNode | undefined): number {
  if (!typeNode) return 1;
  if (ts.isParenthesizedTypeNode(typeNode)) return countTypeArity(typeNode.type);
  if (ts.isTupleTypeNode(typeNode)) return Math.max(1, typeNode.elements.length);
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.reduce((max, t) => Math.max(max, countTypeArity(t)), 1);
  }
  return 1;
}

function countParameters(node: CallableNode): number {
  let total = 0;
  for (const param of node.parameters) {
    if (ts.isIdentifier(param.name) && param.name.text === 'this') continue;
    total += param.dotDotDotToken ? countTypeArity(param.type) : 1;
  }
  return total;
}

export class AntiSpaghettiValidator {
  private readonly maxCyclomaticComplexity: number;
  private readonly maxCognitiveComplexity: number;
  private readonly maxParams: number;
  private readonly maxClassMethods: number;
  private readonly maxFileImports: number;

  constructor(options: AntiSpaghettiOptions = {}) {
    this.maxCyclomaticComplexity = options.maxCyclomaticComplexity ?? 15;
    this.maxCognitiveComplexity = options.maxCognitiveComplexity ?? 18;
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

  private checkCallable(node: CallableNode, sf: ts.SourceFile, filePath: string, violations: CageViolation[]): void {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const name = resolveCallableName(node);
    const add = (rule: CageRuleType, message: string, severity: 'error' | 'warning'): void => {
      violations.push({ rule, filePath, line, message, severity });
    };
    const complexity = calculateCyclomaticComplexity(node);
    if (complexity > this.maxCyclomaticComplexity) {
      add('CYCLOMATIC_COMPLEXITY', `Function '${name}' has cyclomatic complexity ${complexity}, exceeding maximum ${this.maxCyclomaticComplexity}.`, 'error');
    }
    const cognitive = calculateCognitiveComplexity(node);
    if (cognitive > this.maxCognitiveComplexity) {
      add('ARCH_003_COGNITIVE_COMPLEXITY', `Function '${name}' has cognitive complexity ${cognitive}, exceeding maximum ${this.maxCognitiveComplexity}.`, 'warning');
    }
    const paramCount = countParameters(node);
    if (paramCount > this.maxParams) {
      add('TS_004_MAX_PARAMS', `Function '${name}' takes ${paramCount} parameters, exceeding threshold (${this.maxParams}). Group into an options object.`, 'warning');
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
