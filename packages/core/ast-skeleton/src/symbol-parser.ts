import ts from 'typescript';

export interface SymbolEntry {
  name: string;
  kind: 'class' | 'function' | 'method' | 'signal' | 'interface' | 'variable';
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
    return { name: node.name.text, kind: 'interface', filePath, startLine: start, endLine: end, signature: `type ${node.name.text}` };
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
      const line = lines[i];
      const trimmed = line.trim();
      const codeOnly = trimmed.replace(/#.*$/, '').trim();
      const lineNum = i + 1;

      const clsMatch = codeOnly.match(/^class_name\s+([a-zA-Z_]\w*)/);
      if (clsMatch) {
        curClass = clsMatch[1];
        symbols.push({ name: curClass, kind: 'class', filePath: normPath, startLine: lineNum, endLine: lines.length, signature: `class_name ${curClass}` });
      }

      const sigMatch = codeOnly.match(/^signal\s+([a-zA-Z_]\w*)(.*)/);
      if (sigMatch) {
        symbols.push({ name: sigMatch[1], kind: 'signal', filePath: normPath, startLine: lineNum, endLine: lineNum, signature: `signal ${sigMatch[1]}${sigMatch[2]}`.trim() });
      }

      const funcMatch = codeOnly.match(/^(?:static\s+)?func\s+([a-zA-Z_]\w*)\s*\((.*?)\)(?:\s*->\s*([^:]+))?:/);
      if (funcMatch) {
        const fnName = curClass ? `${curClass}.${funcMatch[1]}` : funcMatch[1];
        const endLine = SymbolParser.findGdFuncEnd(lines, i);
        symbols.push({
          name: fnName,
          kind: curClass ? 'method' : 'function',
          filePath: normPath,
          startLine: lineNum,
          endLine,
          signature: codeOnly.replace(/:$/, '')
        });
      }
    }
    return symbols;
  }

  private static findGdFuncEnd(lines: string[], startIdx: number): number {
    const baseIndent = (lines[startIdx].match(/^[\t\s]*/)?.[0] || '').length;
    for (let j = startIdx + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || l.trim().startsWith('#')) continue;
      const indent = (l.match(/^[\t\s]*/)?.[0] || '').length;
      if (indent <= baseIndent) return j;
    }
    return lines.length;
  }

  public static parseGeneric(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);
    const fnPattern = /(?:def|fn|func)\s+([a-zA-Z_]\w*)\s*\(/;
    const clsPattern = /(?:class|struct)\s+([a-zA-Z_]\w*)/;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const fn = trimmed.match(fnPattern);
      if (fn) {
        symbols.push({ name: fn[1], kind: 'function', filePath: normPath, startLine: i + 1, endLine: i + 1, signature: trimmed });
      }
      const cls = trimmed.match(clsPattern);
      if (cls) {
        symbols.push({ name: cls[1], kind: 'class', filePath: normPath, startLine: i + 1, endLine: i + 1, signature: trimmed });
      }
    }
    return symbols;
  }
}
