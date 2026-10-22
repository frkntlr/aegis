import ts from 'typescript';
import type { LanguageExtractor } from './extractor-registry.js';

export interface SkeletonResult {
  originalLength: number;
  skeletonLength: number;
  tokenSavingsPercent: number;
  skeletonContent: string;
}

export class TypeScriptSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'typescript';
  public readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];

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
    const decls = node.declarationList.declarations.map(d => {
      const type = d.type ? `: ${d.type.getText(sf)}` : '';
      return `${d.name.getText(sf)}${type} = ...;`;
    }).join(', ');
    return `${modifiers}const ${decls}`;
  }

  private formatClassMember(m: ts.ClassElement, sf: ts.SourceFile): string {
    if (ts.isMethodDeclaration(m)) {
      const isStatic = ts.canHaveModifiers(m) && ts.getModifiers(m)?.some(x => x.kind === ts.SyntaxKind.StaticKeyword) ? 'static ' : '';
      const name = m.name.getText(sf);
      const params = m.parameters.map(p => p.getText(sf)).join(', ');
      const returnType = m.type ? `: ${m.type.getText(sf)}` : '';
      return `  ${isStatic}${name}(${params})${returnType};`;
    }
    if (ts.isPropertyDeclaration(m)) {
      const isStatic = ts.canHaveModifiers(m) && ts.getModifiers(m)?.some(x => x.kind === ts.SyntaxKind.StaticKeyword) ? 'static ' : '';
      const name = m.name.getText(sf);
      const type = m.type ? `: ${m.type.getText(sf)}` : '';
      return `  ${isStatic}${name}${type};`;
    }
    if (ts.isConstructorDeclaration(m)) {
      const params = m.parameters.map(p => p.getText(sf)).join(', ');
      return `  constructor(${params});`;
    }
    return '';
  }

  private formatClass(node: ts.ClassDeclaration, sf: ts.SourceFile): string {
    const modifiers = ts.canHaveModifiers(node) && ts.getModifiers(node)
      ? ts.getModifiers(node)!.map(m => m.getText(sf)).join(' ') + ' '
      : '';
    const name = node.name ? node.name.text : 'AnonymousClass';
    const heritage = node.heritageClauses ? ' ' + node.heritageClauses.map(h => h.getText(sf)).join(' ') : '';
    const members: string[] = [];

    for (const m of node.members) {
      const memStr = this.formatClassMember(m, sf);
      if (memStr) members.push(memStr);
    }
    return `${modifiers}class ${name}${heritage} {\n${members.join('\n')}\n}`;
  }

  private formatAstNode(node: ts.Node, sf: ts.SourceFile, skeletonLines: string[]): void {
    if (ts.isImportDeclaration(node)) {
      skeletonLines.push(node.getText(sf));
    } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
      skeletonLines.push(node.getText(sf));
    } else if (ts.isFunctionDeclaration(node)) {
      skeletonLines.push(this.formatFunction(node, sf));
    } else if (ts.isClassDeclaration(node)) {
      skeletonLines.push(this.formatClass(node, sf));
    } else if (ts.isVariableStatement(node)) {
      skeletonLines.push(this.formatVariables(node, sf));
    }
  }

  public extract(_relativePath: string, sourceCode: string): SkeletonResult {
    const sourceFile = ts.createSourceFile('temp.ts', sourceCode, ts.ScriptTarget.Latest, true);
    const skeletonLines: string[] = [];

    ts.forEachChild(sourceFile, (node) => {
      this.formatAstNode(node, sourceFile, skeletonLines);
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
