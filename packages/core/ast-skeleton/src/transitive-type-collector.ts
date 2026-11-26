/**
 * @file transitive-type-collector.ts
 * AST lookup, signature collection, and result formatting helpers for TransitiveTypeClosure.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import ts from 'typescript';
import { TransitiveTypeUtils, type BoundedTypeClosureResult } from './transitive-type-utils.js';

export function loadCachedSourceFile(
  targetPath: string,
  fileCache: Map<string, ts.SourceFile>,
  readFile: (p: string) => string | null
): ts.SourceFile | null {
  const cached = fileCache.get(targetPath);
  if (cached) return cached;
  const code = readFile(targetPath);
  if (!code) return null;
  const parsed = ts.createSourceFile(targetPath, code, ts.ScriptTarget.Latest, true);
  fileCache.set(targetPath, parsed);
  return parsed;
}

export function findDeclInSource(sf: ts.SourceFile, typeName: string): string | null {
  for (const stmt of sf.statements) {
    if (
      (ts.isInterfaceDeclaration(stmt) && stmt.name.text === typeName) ||
      (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === typeName) ||
      (ts.isEnumDeclaration(stmt) && stmt.name.text === typeName) ||
      (ts.isClassDeclaration(stmt) && stmt.name?.text === typeName)
    ) {
      return stmt.getText(sf);
    }
  }
  return null;
}

export function findTargetNode(sf: ts.SourceFile, symbolName: string): ts.Node | null {
  const target = symbolName.includes('.') ? (symbolName.split('.').pop() ?? symbolName) : symbolName;
  let found: ts.Node | null = null;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name?.getText(sf) === target) {
      found = n;
      return;
    }
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText(sf) === target &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      found = n.initializer;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return found;
}

export function collectSignatures(node: ts.Node, sf: ts.SourceFile): string[] {
  const names: string[] = [];
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  ) {
    for (const p of node.parameters) {
      if (p.type) names.push(...TransitiveTypeUtils.extractTypeIdentifiers(p.type.getText(sf)));
    }
    if (node.type) {
      names.push(...TransitiveTypeUtils.extractTypeIdentifiers(node.type.getText(sf)));
    }
  }
  return [...new Set(names)];
}

export function processTransitiveTypes(
  typeNames: string[],
  visited: Set<string>,
  opaqueStubs: string[],
  monomorphizedTypes: string[],
  enableOpaqueStubbing: boolean
): void {
  for (const t of typeNames) {
    if (visited.has(t)) continue;
    visited.add(t);
    if (t.includes('<') && t.includes('>')) {
      const baseName = t.split('<')[0] ?? t;
      const mono = TransitiveTypeUtils.monomorphizeGeneric(baseName, ['T']);
      monomorphizedTypes.push(`export type ${mono} = { readonly __monomorphized: true };`);
    } else if (enableOpaqueStubbing) {
      opaqueStubs.push(TransitiveTypeUtils.generateOpaqueStub(t));
    }
  }
}

export function emptyClosureResult(): BoundedTypeClosureResult {
  return {
    fullDeclarations: [],
    opaqueStubs: [],
    monomorphizedTypes: [],
    formattedBlock: '',
    exceededBudget: false,
    totalLines: 0
  };
}

export function buildClosureResult(
  fullDecls: string[],
  stubs: string[],
  mono: string[],
  lineBudget: number
): BoundedTypeClosureResult {
  const lines: string[] = [];
  if (fullDecls.length > 0) {
    lines.push('// 📦 [Ambient Type Closure - Param & Return Types]', ...fullDecls);
  }
  if (stubs.length > 0) {
    lines.push('// 🛡️ [Transitive Opaque Stubs - Zero Context Bloat]', ...stubs);
  }
  if (mono.length > 0) {
    lines.push('// ⚡ [Monomorphized Call-Site Generic Types]', ...mono);
  }

  const totalLines = lines.join('\n').split('\n').length;
  const exceededBudget = totalLines > lineBudget;
  const formattedBlock = exceededBudget
    ? [
        `// ⚠️ [Token Guardrail] Type closure (${totalLines} lines) exceeded budget (${lineBudget}).`,
        '// Collapsed to opaque stubs to protect context window:',
        ...stubs
      ].join('\n')
    : lines.join('\n\n');

  return {
    fullDeclarations: fullDecls,
    opaqueStubs: stubs,
    monomorphizedTypes: mono,
    formattedBlock,
    exceededBudget,
    totalLines
  };
}
