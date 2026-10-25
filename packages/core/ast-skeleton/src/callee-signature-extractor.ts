import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
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

export class CalleeSignatureExtractor {
  private options: CalleeExtractorOptions;

  constructor(options: CalleeExtractorOptions = {}) {
    this.options = options;
  }

  private findTargetFunction(sf: ts.SourceFile, symbolName: string): ts.Node | null {
    const targetName = symbolName.includes('.') ? symbolName.split('.').pop()! : symbolName;
    let target: ts.Node | null = null;
    const walk = (n: ts.Node): void => {
      if (target) return;
      if (
        (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) &&
        n.name && n.name.getText(sf) === targetName
      ) {
        target = n;
        return;
      }
      if (ts.isVariableDeclaration(n) && n.name.getText(sf) === targetName && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
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

  private formatSignatureFromNode(n: ts.FunctionDeclaration | ts.MethodDeclaration, sf: ts.SourceFile, prefix = ''): string {
    const name = n.name ? n.name.getText(sf) : 'anonymous';
    const params = n.parameters.map(p => p.getText(sf)).join(', ');
    const ret = n.type ? `: ${n.type.getText(sf)}` : '';
    return `${prefix}${name}(${params})${ret};`;
  }

  private findLocalSignature(sf: ts.SourceFile, callText: string): string | null {
    const methodName = callText.includes('.') ? callText.split('.').pop()! : callText;
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name?.getText(sf) === methodName) {
        return this.formatSignatureFromNode(stmt, sf, callText.includes('.') ? callText.slice(0, callText.lastIndexOf('.') + 1) : '');
      }
      if (ts.isClassDeclaration(stmt)) {
        for (const member of stmt.members) {
          if (ts.isMethodDeclaration(member) && member.name?.getText(sf) === methodName) {
            const prefix = callText.startsWith('this.') ? 'this.' : (callText.includes('.') ? callText.slice(0, callText.lastIndexOf('.') + 1) : '');
            return this.formatSignatureFromNode(member, sf, prefix);
          }
        }
      }
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
      try { return fs.readFileSync(full, 'utf8'); } catch { /* ignore */ }
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
    const sf = ts.createSourceFile(targetEntry.filePath, content, ts.ScriptTarget.Latest, true);
    return this.findLocalSignature(sf, callText);
  }

  public extractCalleeSignatures(symbolName: string, filePath: string, sourceCode: string): CalleeSignatureResult {
    const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
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
