import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { debugLogIgnored } from '@aegis/shared';
import type { SymbolIndexer } from './symbol-indexer.js';

export interface CalleeSignatureResult {
  callees: string[];
  signatures: string[];
  formattedBlock: string;
}

export interface CalleeExtractorOptions {
  indexer?: SymbolIndexer;
  baseDir?: string;
  sourceFileProvider?: (filePath: string) => string | null;
}

type CallableExpr = ts.ArrowFunction | ts.FunctionExpression;

function isFnExpr(node: ts.Expression | undefined): node is CallableExpr {
  return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function formatCallableSignature(
  name: string,
  node: ts.SignatureDeclarationBase,
  sf: ts.SourceFile,
  prefix = ''
): string {
  const params = node.parameters.map(p => p.getText(sf)).join(', ');
  const ret = node.type ? `: ${node.type.getText(sf)}` : '';
  return `${prefix}${name}(${params})${ret};`;
}

function findClassMemberSignature(
  stmt: ts.ClassDeclaration,
  sf: ts.SourceFile,
  methodName: string,
  prefix: string
): string | null {
  for (const member of stmt.members) {
    if (ts.isMethodDeclaration(member) && member.name.getText(sf) === methodName) {
      return formatCallableSignature(methodName, member, sf, prefix);
    }
    if (ts.isPropertyDeclaration(member) && member.name.getText(sf) === methodName && isFnExpr(member.initializer)) {
      return formatCallableSignature(methodName, member.initializer, sf, prefix);
    }
  }
  return null;
}

export class CalleeSignatureExtractor {
  private options: CalleeExtractorOptions;
  private astCache = new Map<string, ts.SourceFile>();

  constructor(options: CalleeExtractorOptions = {}) {
    this.options = options;
  }

  private getOrCreateSourceFile(filePath: string, content: string): ts.SourceFile {
    let sf = this.astCache.get(filePath);
    if (!sf) {
      sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      if (this.astCache.size > 50) this.astCache.clear();
      this.astCache.set(filePath, sf);
    }
    return sf;
  }

  private findTargetFunction(sf: ts.SourceFile, symbolName: string): ts.Node | null {
    const targetName = symbolName.includes('.') ? symbolName.split('.').pop()! : symbolName;
    let target: ts.Node | null = null;
    const walk = (n: ts.Node): void => {
      if (target) return;
      if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name?.getText(sf) === targetName) {
        target = n;
        return;
      }
      if ((ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n)) && n.name.getText(sf) === targetName && isFnExpr(n.initializer)) {
        target = n.initializer;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return target;
  }

  public extractCalls(functionNode: ts.Node, sf: ts.SourceFile): string[] {
    const rawCalls: string[] = [];
    const walk = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const text = n.expression.getText(sf);
        if (text && !text.includes('console.') && !text.includes('assert.')) {
          rawCalls.push(text);
        }
      }
      ts.forEachChild(n, walk);
    };
    ts.forEachChild(functionNode, walk);
    return [...new Set(rawCalls)];
  }

  private findVariableSignature(stmt: ts.Statement, sf: ts.SourceFile, methodName: string, prefix: string): string | null {
    if (!ts.isVariableStatement(stmt)) return null;
    for (const decl of stmt.declarationList.declarations) {
      if (decl.name.getText(sf) === methodName && isFnExpr(decl.initializer)) {
        return formatCallableSignature(methodName, decl.initializer, sf, prefix);
      }
    }
    return null;
  }

  private findStatementSignature(stmt: ts.Statement, sf: ts.SourceFile, methodName: string, prefix: string): string | null {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.getText(sf) === methodName) {
      return formatCallableSignature(methodName, stmt, sf, prefix);
    }
    if (ts.isClassDeclaration(stmt)) {
      return findClassMemberSignature(stmt, sf, methodName, prefix);
    }
    return this.findVariableSignature(stmt, sf, methodName, prefix);
  }

  private findLocalSignature(sf: ts.SourceFile, callText: string): string | null {
    const dotIdx = callText.lastIndexOf('.');
    const methodName = dotIdx >= 0 ? callText.slice(dotIdx + 1) : callText;
    const prefix = callText.startsWith('this.') ? 'this.' : dotIdx >= 0 ? callText.slice(0, dotIdx + 1) : '';
    for (const stmt of sf.statements) {
      const sig = this.findStatementSignature(stmt, sf, methodName, prefix);
      if (sig) return sig;
    }
    return null;
  }

  private readTargetFile(targetPath: string): string | null {
    if (this.options.sourceFileProvider) {
      const provided = this.options.sourceFileProvider(targetPath);
      if (provided !== null) return provided;
    }
    const baseDir = this.options.baseDir || process.cwd();
    const full = path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath);
    if (fs.existsSync(full)) {
      try { return fs.readFileSync(full, 'utf8'); } catch (err: unknown) { debugLogIgnored('CalleeSignatureExtractor:read', err); }
    }
    return null;
  }

  private findExternalSignature(callText: string): string | null {
    if (!this.options.indexer) return null;
    const methodName = callText.includes('.') ? callText.split('.').pop()! : callText;
    const matches = this.options.indexer.findSymbols(methodName);
    const targetEntry = matches.find(m => m.kind === 'function' || m.kind === 'method');
    if (!targetEntry) return null;

    const content = this.readTargetFile(targetEntry.filePath);
    if (!content) return null;
    const sf = this.getOrCreateSourceFile(targetEntry.filePath, content);
    return this.findLocalSignature(sf, callText);
  }

  public extractCalleeSignatures(symbolName: string, filePath: string, sourceCode: string): CalleeSignatureResult {
    const sf = this.getOrCreateSourceFile(filePath, sourceCode);
    const targetNode = this.findTargetFunction(sf, symbolName);
    if (!targetNode) {
      return { callees: [], signatures: [], formattedBlock: '' };
    }

    const calls = this.extractCalls(targetNode, sf);
    const signatures: string[] = [];

    for (const call of calls) {
      const localSig = this.findLocalSignature(sf, call);
      if (localSig) {
        signatures.push(localSig);
        continue;
      }
      const extSig = this.findExternalSignature(call);
      if (extSig) {
        signatures.push(extSig);
      }
    }

    const uniqueSigs = [...new Set(signatures)];
    const formattedBlock = uniqueSigs.length > 0
      ? `// 🔗 [Callee Signatures - 1st Degree Invocations]\n${uniqueSigs.map(s => `// - ${s}`).join('\n')}`
      : '';

    return { callees: calls, signatures: uniqueSigs, formattedBlock };
  }
}
