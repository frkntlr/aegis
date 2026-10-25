import type { SymbolEntry } from './symbol-parser.js';

export class PolyglotParser {
  public static parsePython(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);
    let inDocstring = false;
    let curClass = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.includes('"""') || trimmed.includes("'''")) {
        const tripleCount = (trimmed.match(/("""|''')/g) || []).length;
        if (tripleCount % 2 !== 0) inDocstring = !inDocstring;
        if (inDocstring || trimmed.startsWith('"""') || trimmed.startsWith("'''")) continue;
      }
      if (inDocstring || trimmed.startsWith('#')) continue;

      const clsMatch = trimmed.match(/^class\s+([a-zA-Z_]\w*)(?:\((.*?)\))?:/);
      if (clsMatch) {
        curClass = clsMatch[1];
        const bases = clsMatch[2] ? `(${clsMatch[2].trim()})` : '';
        symbols.push({
          name: curClass, kind: 'class', filePath: normPath,
          startLine: i + 1, endLine: lines.length, signature: `class ${curClass}${bases}:`
        });
        continue;
      }

      const fnMatch = trimmed.match(/^(?:(async)\s+)?def\s+([a-zA-Z_]\w*)\s*\((.*?)\)(?:\s*->\s*([^:]+))?:/);
      if (fnMatch) {
        PolyglotParser.handlePythonFunction(fnMatch, curClass, normPath, lines, i, symbols);
      }
    }
    return symbols;
  }

  private static handlePythonFunction(
    fnMatch: RegExpMatchArray,
    curClass: string,
    normPath: string,
    lines: string[],
    i: number,
    symbols: SymbolEntry[]
  ): void {
    const isAsync = Boolean(fnMatch[1]);
    const fnName = fnMatch[2];
    const prefix = isAsync ? 'async def' : 'def';
    const ret = fnMatch[4] ? ` -> ${fnMatch[4].trim()}` : '';
    const endLine = PolyglotParser.findPythonEnd(lines, i);
    symbols.push({
      name: fnName, kind: curClass ? 'method' : 'function', filePath: normPath,
      startLine: i + 1, endLine, signature: `${prefix} ${fnMatch[2]}(${fnMatch[3]})${ret}:`
    });
    if (curClass) {
      symbols.push({
        name: `${curClass}.${fnName}`, kind: 'method', filePath: normPath,
        startLine: i + 1, endLine, signature: `${prefix} ${fnMatch[2]}(${fnMatch[3]})${ret}:`
      });
    }
  }

  public static findPythonEnd(lines: string[], startIdx: number): number {
    const baseIndent = (lines[startIdx].match(/^[\t\s]*/)?.[0] || '').length;
    for (let j = startIdx + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || l.trim().startsWith('#')) continue;
      const indent = (l.match(/^[\t\s]*/)?.[0] || '').length;
      if (indent <= baseIndent) return j;
    }
    return lines.length;
  }

  public static parseRust(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);
    let curImpl = '';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      const implMatch = trimmed.match(/^impl(?:<.*?>)?\s+(?:.*?\s+for\s+)?([a-zA-Z_]\w*)/);
      if (implMatch) {
        curImpl = implMatch[1];
        continue;
      }

      const fnMatch = trimmed.match(/^(?:pub(?:\(.*?\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z_]\w*)\s*(?:<.*?>)?\s*\((.*?)\)(?:\s*->\s*([^\{]+))?/);
      if (fnMatch) {
        const fnName = curImpl ? `${curImpl}::${fnMatch[1]}` : fnMatch[1];
        symbols.push({
          name: fnName, kind: curImpl ? 'method' : 'function', filePath: normPath,
          startLine: i + 1, endLine: i + 1, signature: trimmed.replace(/\{$/, '').trim()
        });
      } else if (trimmed.match(/^(?:pub\s+)?struct\s+([a-zA-Z_]\w*)/)) {
        const sMatch = trimmed.match(/^(?:pub\s+)?struct\s+([a-zA-Z_]\w*)/)!;
        symbols.push({ name: sMatch[1], kind: 'class', filePath: normPath, startLine: i + 1, endLine: i + 1, signature: trimmed });
      }
    }
    return symbols;
  }

  public static parseGo(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//')) continue;

      const typeMatch = trimmed.match(/^type\s+([a-zA-Z_]\w*)\s+(struct|interface)/);
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], kind: 'class', filePath: normPath, startLine: i + 1, endLine: i + 1, signature: trimmed });
        continue;
      }

      const methodMatch = trimmed.match(/^func\s+\(\s*\w+\s+\*?([a-zA-Z_]\w*)\s*\)\s*([a-zA-Z_]\w*)\s*\((.*?)\)/);
      if (methodMatch) {
        symbols.push({
          name: `${methodMatch[1]}.${methodMatch[2]}`, kind: 'method', filePath: normPath,
          startLine: i + 1, endLine: i + 1, signature: trimmed.replace(/\{$/, '').trim()
        });
        continue;
      }

      const fnMatch = trimmed.match(/^func\s+([a-zA-Z_]\w*)\s*\((.*?)\)/);
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], kind: 'function', filePath: normPath, startLine: i + 1, endLine: i + 1, signature: trimmed.replace(/\{$/, '').trim() });
      }
    }
    return symbols;
  }

  public static parseCSharp(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);
    let curClass = '';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      const typeMatch = trimmed.match(
        /^(?:public|private|protected|internal|static|abstract|sealed|partial|\s)*(?:class|interface|struct|record|enum)\s+([a-zA-Z_]\w*)/
      );
      if (typeMatch) {
        curClass = typeMatch[1];
        symbols.push({
          name: curClass,
          kind: trimmed.includes('interface') ? 'interface' : 'class',
          filePath: normPath,
          startLine: i + 1,
          endLine: lines.length,
          signature: trimmed.replace(/\{.*$/, '').trim()
        });
        continue;
      }

      PolyglotParser.parseCSharpMember(lines, i, normPath, curClass, trimmed, symbols);
    }
    return symbols;
  }

  private static parseCSharpMember(
    _lines: string[],
    i: number,
    normPath: string,
    curClass: string,
    trimmed: string,
    symbols: SymbolEntry[]
  ): void {
    const methodMatch = trimmed.match(
      /^(?:public|private|protected|internal|static|async|virtual|override|abstract|sealed|partial|\s)*(?:[\w<>\[\],\s\?]+)\s+([a-zA-Z_]\w*)\s*\((.*?)\)/
    );
    if (methodMatch && !trimmed.startsWith('new ') && !trimmed.startsWith('return ')) {
      const methodName = curClass ? `${curClass}.${methodMatch[1]}` : methodMatch[1];
      symbols.push({
        name: methodName,
        kind: curClass ? 'method' : 'function',
        filePath: normPath,
        startLine: i + 1,
        endLine: i + 1,
        signature: trimmed.replace(/\{.*$/, '').trim()
      });
      return;
    }

    const propMatch = trimmed.match(
      /^(?:public|private|protected|internal|static|virtual|override|\s)*(?:[\w<>\[\],\s\?]+)\s+([a-zA-Z_]\w*)\s*\{\s*(?:get|set|init)/
    );
    if (propMatch) {
      const propName = curClass ? `${curClass}.${propMatch[1]}` : propMatch[1];
      symbols.push({
        name: propName,
        kind: 'variable',
        filePath: normPath,
        startLine: i + 1,
        endLine: i + 1,
        signature: trimmed
      });
    }
  }

  public static parseBash(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const symbols: SymbolEntry[] = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('#')) continue;

      const fnMatch = trimmed.match(/^(?:function\s+)?([a-zA-Z_0-9\-]+)\s*(?:\(\))?\s*\{?/);
      if (fnMatch && !['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'export', 'set', 'return'].includes(fnMatch[1])) {
        if (trimmed.includes('()') || trimmed.startsWith('function ')) {
          symbols.push({
            name: fnMatch[1],
            kind: 'function',
            filePath: normPath,
            startLine: i + 1,
            endLine: i + 1,
            signature: trimmed.replace(/\{.*$/, '').trim()
          });
        }
      }
    }
    return symbols;
  }
}
