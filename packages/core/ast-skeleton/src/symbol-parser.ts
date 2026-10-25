import ts from 'typescript';
import { PolyglotParser } from './polyglot-parser.js';

export interface SymbolEntry {
  name: string;
  kind: 'class' | 'function' | 'method' | 'signal' | 'interface' | 'variable' | 'type';
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string;
  docstring?: string;
}

export class SymbolParser {
  public static parseTypeScript(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const sf = ts.createSourceFile(normPath, content, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node, parentClass?: string) => {
      if (ts.isClassDeclaration(node) && node.name) {
        symbols.push(SymbolParser.createTsClassEntry(node, sf, normPath));
        ts.forEachChild(node, child => visit(child, node.name?.text));
        return;
      }
      if (ts.isInterfaceDeclaration(node) && node.name) {
        symbols.push(SymbolParser.createTsInterfaceEntry(node, sf, normPath));
      } else if (ts.isTypeAliasDeclaration(node) && node.name) {
        symbols.push(SymbolParser.createTsTypeEntry(node, sf, normPath));
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        symbols.push(SymbolParser.createTsFuncEntry(node, sf, normPath));
      } else if (ts.isMethodDeclaration(node) && node.name && parentClass) {
        symbols.push(SymbolParser.createTsMethodEntry(node, sf, normPath, parentClass));
      } else if (ts.isVariableStatement(node)) {
        SymbolParser.collectVarFuncs(node, sf, normPath, symbols);
      }
      ts.forEachChild(node, child => visit(child, parentClass));
    };

    visit(sf);
    return symbols;
  }

  private static createTsTypeEntry(node: ts.TypeAliasDeclaration, sf: ts.SourceFile, filePath: string): SymbolEntry {
    const { start, end } = SymbolParser.getLineRange(node, sf);
    return { name: node.name.text, kind: 'type', filePath, startLine: start, endLine: end, signature: `type ${node.name.text}` };
  }

  private static collectVarFuncs(node: ts.VariableStatement, sf: ts.SourceFile, filePath: string, out: SymbolEntry[]): void {
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
        const { start, end } = SymbolParser.getLineRange(decl, sf);
        const name = decl.name.text;
        out.push({ name, kind: 'function', filePath, startLine: start, endLine: end, signature: `const ${name} = (...)` });
      }
    }
  }

  private static getLineRange(node: ts.Node, sf: ts.SourceFile): { start: number; end: number } {
    const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    return { start, end };
  }

  private static createTsClassEntry(node: ts.ClassDeclaration, sf: ts.SourceFile, filePath: string): SymbolEntry {
    const { start, end } = SymbolParser.getLineRange(node, sf);
    const name = node.name?.text || 'anonymous';
    return { name, kind: 'class', filePath, startLine: start, endLine: end, signature: `class ${name}` };
  }

  private static createTsInterfaceEntry(node: ts.InterfaceDeclaration, sf: ts.SourceFile, filePath: string): SymbolEntry {
    const { start, end } = SymbolParser.getLineRange(node, sf);
    const name = node.name.text;
    return { name, kind: 'interface', filePath, startLine: start, endLine: end, signature: `interface ${name}` };
  }

  private static createTsFuncEntry(node: ts.FunctionDeclaration, sf: ts.SourceFile, filePath: string): SymbolEntry {
    const { start, end } = SymbolParser.getLineRange(node, sf);
    const name = node.name?.text || 'anonymous';
    const params = node.parameters.map(p => p.getText(sf)).join(', ');
    const ret = node.type ? `: ${node.type.getText(sf)}` : '';
    return { name, kind: 'function', filePath, startLine: start, endLine: end, signature: `function ${name}(${params})${ret}` };
  }

  private static createTsMethodEntry(node: ts.MethodDeclaration, sf: ts.SourceFile, filePath: string, parentClass: string): SymbolEntry {
    const { start, end } = SymbolParser.getLineRange(node, sf);
    const name = node.name.getText(sf);
    const params = node.parameters.map(p => p.getText(sf)).join(', ');
    const ret = node.type ? `: ${node.type.getText(sf)}` : '';
    return {
      name: `${parentClass}.${name}`,
      kind: 'method',
      filePath,
      startLine: start,
      endLine: end,
      signature: `${name}(${params})${ret}`
    };
  }

  public static parseGDScript(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);
    let curClass = '';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const codeOnly = trimmed.replace(/#.*$/, '').trim();
      const cls = codeOnly.match(/^class_name\s+([a-zA-Z_]\w*)/);
      if (cls) {
        curClass = cls[1];
        symbols.push({ name: curClass, kind: 'class', filePath: normPath, startLine: i + 1, endLine: lines.length, signature: `class_name ${curClass}` });
      }
      const innerCls = codeOnly.match(/^class\s+([a-zA-Z_]\w*):/);
      if (innerCls) {
        curClass = innerCls[1];
        symbols.push({ name: curClass, kind: 'class', filePath: normPath, startLine: i + 1, endLine: lines.length, signature: `class ${curClass}:` });
      }
      const prop = codeOnly.match(/^(@export(?:[^\s]*)\s+|@onready\s+)var\s+([a-zA-Z_]\w*)(.*)/);
      if (prop) {
        symbols.push({ name: prop[2], kind: 'variable', filePath: normPath, startLine: i + 1, endLine: i + 1, signature: codeOnly });
      }
      const sig = codeOnly.match(/^signal\s+([a-zA-Z_]\w*)(.*)/);
      if (sig) {
        symbols.push({ name: sig[1], kind: 'signal', filePath: normPath, startLine: i + 1, endLine: i + 1, signature: `signal ${sig[1]}${sig[2]}`.trim() });
      }
      const fn = codeOnly.match(/^(?:@\w+(?:\([^)]*\))?\s+)*(?:static\s+)?func\s+([a-zA-Z_]\w*)\s*\((.*?)\)(?:\s*->\s*([^:]+))?:/);
      if (fn) SymbolParser.parseGdFunction(lines, i, normPath, curClass, codeOnly, fn, symbols);
    }
    SymbolParser.attachFallbackClass(normPath, curClass, lines.length, symbols);
    return symbols;
  }

  private static parseGdFunction(lines: string[], i: number, normPath: string, curClass: string, codeOnly: string, fn: RegExpMatchArray, symbols: SymbolEntry[]): void {
    const fnName = curClass ? `${curClass}.${fn[1]}` : fn[1];
    const startLine = SymbolParser.findDecoratorStart(lines, i + 1);
    const endLine = SymbolParser.findGdFuncEnd(lines, i);
    symbols.push({ name: fnName, kind: curClass ? 'method' : 'function', filePath: normPath, startLine, endLine, signature: codeOnly.replace(/:$/, '') });
    if (!curClass) {
      const fallback = normPath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
      if (fallback) {
        symbols.push({ name: `${fallback}.${fn[1]}`, kind: 'method', filePath: normPath, startLine, endLine, signature: codeOnly.replace(/:$/, '') });
      }
    }
  }

  private static attachFallbackClass(normPath: string, curClass: string, lineCount: number, symbols: SymbolEntry[]): void {
    if (curClass) return;
    const fallback = normPath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
    if (fallback) {
      symbols.unshift({ name: fallback, kind: 'class', filePath: normPath, startLine: 1, endLine: lineCount, signature: `class ${fallback}` });
    }
  }

  private static findDecoratorStart(lines: string[], lineNum: number): number {
    let start = lineNum;
    while (start > 1 && lines[start - 2].trim().startsWith('@')) start--;
    return start;
  }

  private static findGdFuncEnd(lines: string[], startIdx: number): number {
    const baseIndent = (lines[startIdx].match(/^[\t\s]*/)?.[0] || '').length;
    for (let j = startIdx + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || l.trim().startsWith('#') || l.trim().startsWith('//')) continue;
      const indent = (l.match(/^[\t\s]*/)?.[0] || '').length;
      if (indent <= baseIndent) return j;
    }
    return lines.length;
  }

  public static parseGeneric(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    if (normPath.endsWith('.py')) return PolyglotParser.parsePython(filePath, content);
    if (normPath.endsWith('.rs')) return PolyglotParser.parseRust(filePath, content);
    if (normPath.endsWith('.go')) return PolyglotParser.parseGo(filePath, content);
    if (normPath.endsWith('.cs')) return PolyglotParser.parseCSharp(filePath, content);
    if (normPath.endsWith('.sh') || normPath.endsWith('.bash')) return PolyglotParser.parseBash(filePath, content);
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);
    const fnPattern = /(?:def|fn|func)\s+([a-zA-Z_]\w*)\s*\(/;
    const clsPattern = /(?:class|struct)\s+([a-zA-Z_]\w*)/;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const fn = trimmed.match(fnPattern);
      if (fn) {
        const endLine = SymbolParser.findBlockEnd(lines, i);
        symbols.push({ name: fn[1], kind: 'function', filePath: normPath, startLine: i + 1, endLine, signature: trimmed });
      }
      const cls = trimmed.match(clsPattern);
      if (cls) {
        const endLine = SymbolParser.findBlockEnd(lines, i);
        symbols.push({ name: cls[1], kind: 'class', filePath: normPath, startLine: i + 1, endLine, signature: trimmed });
      }
    }
    return symbols;
  }

  private static findBlockEnd(lines: string[], startIdx: number): number {
    let braceCount = 0;
    let hasBraces = false;
    for (let j = startIdx; j < lines.length; j++) {
      const l = lines[j].replace(/\/\/.*$/, '').replace(/#.*$/, '');
      const open = (l.match(/\{/g) || []).length;
      const close = (l.match(/\}/g) || []).length;
      if (open > 0) hasBraces = true;
      braceCount += open - close;
      if (hasBraces && braceCount <= 0) return j + 1;
    }
    if (hasBraces) return lines.length;
    return SymbolParser.findGdFuncEnd(lines, startIdx);
  }
}
