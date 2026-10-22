import ts from 'typescript';

export interface SkeletonResult {
  originalLength: number;
  skeletonLength: number;
  tokenSavingsPercent: number;
  skeletonContent: string;
}

export class TypeScriptSkeletonExtractor {
  private formatFunction(node: ts.FunctionDeclaration, sf: ts.SourceFile): string {
    const modifiers = ts.canHaveModifiers(node) && ts.getModifiers(node)
      ? ts.getModifiers(node)!.map(m => m.getText(sf)).join(' ') + ' '
      : '';
    const name = node.name ? node.name.text : 'anonymous';
    const typeParams = node.typeParameters ? `<${node.typeParameters.map(p => p.getText(sf)).join(', ')}>` : '';
    const params = node.parameters.map(p => p.getText(sf)).join(', ');
    const returnType = node.type ? `: ${node.type.getText(sf)}` : '';
    return `${modifiers}function ${name}${typeParams}(${params})${returnType}; // [body omitted]`;
  }

  private formatVariables(node: ts.VariableStatement, sf: ts.SourceFile): string {
    const modifiers = ts.canHaveModifiers(node) && ts.getModifiers(node)
      ? ts.getModifiers(node)!.map(m => m.getText(sf)).join(' ') + ' '
      : '';
    const declarations = node.declarationList.declarations.map(dec => {
      const varName = dec.name.getText(sf);
      const varType = dec.type ? `: ${dec.type.getText(sf)}` : '';
      if (dec.initializer && (ts.isArrowFunction(dec.initializer) || ts.isFunctionExpression(dec.initializer))) {
        const fn = dec.initializer;
        const params = fn.parameters.map(p => p.getText(sf)).join(', ');
        const retType = fn.type ? `: ${fn.type.getText(sf)}` : '';
        return `${varName}${varType} = (${params})${retType} => { /* [omitted] */ }`;
      }
      return `${varName}${varType}${dec.initializer ? ' = ...' : ''}`;
    }).join(', ');
    const kind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let';
    return `${modifiers}${kind} ${declarations};`;
  }

  private formatClassMember(member: ts.ClassElement, sf: ts.SourceFile): string | null {
    const memModifiers = ts.canHaveModifiers(member) && ts.getModifiers(member)
      ? ts.getModifiers(member)!.map(m => m.getText(sf)).join(' ') + ' '
      : '';
    if (ts.isPropertyDeclaration(member)) {
      const propName = member.name.getText(sf);
      const propType = member.type ? `: ${member.type.getText(sf)}` : '';
      return `  ${memModifiers}${propName}${propType};`;
    }
    if (ts.isMethodDeclaration(member)) {
      const methodName = member.name.getText(sf);
      const params = member.parameters.map(p => p.getText(sf)).join(', ');
      const retType = member.type ? `: ${member.type.getText(sf)}` : '';
      return `  ${memModifiers}${methodName}(${params})${retType};`;
    }
    if (ts.isConstructorDeclaration(member)) {
      const params = member.parameters.map(p => p.getText(sf)).join(', ');
      return `  ${memModifiers}constructor(${params});`;
    }
    return null;
  }

  private formatClass(node: ts.ClassDeclaration, sf: ts.SourceFile): string {
    const modifiers = ts.canHaveModifiers(node) && ts.getModifiers(node)
      ? ts.getModifiers(node)!.map(m => m.getText(sf)).join(' ') + ' '
      : '';
    const name = node.name ? node.name.text : 'AnonymousClass';
    const heritage = node.heritageClauses ? ' ' + node.heritageClauses.map(h => h.getText(sf)).join(' ') : '';
    const memberLines = node.members
      .map(m => this.formatClassMember(m, sf))
      .filter((line): line is string => Boolean(line));
    return `${modifiers}class ${name}${heritage} {\n${memberLines.join('\n')}\n}`;
  }

  public extract(filePath: string, sourceCode: string): SkeletonResult {
    const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const skeletonLines: string[] = [];

    ts.forEachChild(sf, (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
        skeletonLines.push(sf.text.substring(node.pos, node.end).trim());
      } else if (ts.isFunctionDeclaration(node)) {
        skeletonLines.push(this.formatFunction(node, sf));
      } else if (ts.isVariableStatement(node)) {
        skeletonLines.push(this.formatVariables(node, sf));
      } else if (ts.isClassDeclaration(node)) {
        skeletonLines.push(this.formatClass(node, sf));
      }
    });

    const skeletonContent = skeletonLines.join('\n\n');
    const origLen = sourceCode.length;
    const skelLen = skeletonContent.length;
    const savings = origLen > 0 ? ((origLen - skelLen) / origLen) * 100 : 0;
    return {
      originalLength: origLen,
      skeletonLength: skelLen,
      tokenSavingsPercent: Math.max(0, Math.round(savings)),
      skeletonContent
    };
  }
}
