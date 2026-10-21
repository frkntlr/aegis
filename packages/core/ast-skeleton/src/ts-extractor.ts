import ts from 'typescript';

export interface SkeletonResult {
  originalLength: number;
  skeletonLength: number;
  tokenSavingsPercent: number;
  skeletonContent: string;
}

export class TypeScriptSkeletonExtractor {
  public extract(filePath: string, sourceCode: string): SkeletonResult {
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const skeletonLines: string[] = [];
    const sourceText = sourceFile.text;

    const getNodeText = (node: ts.Node): string => {
      return sourceText.substring(node.pos, node.end).trim();
    };

    ts.forEachChild(sourceFile, (node) => {
      // 1. Preserve Imports
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        skeletonLines.push(getNodeText(node));
        return;
      }

      // 2. Preserve Type Aliases & Interfaces completely
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        skeletonLines.push(getNodeText(node));
        return;
      }

      // 3. Preserve Enum Declarations
      if (ts.isEnumDeclaration(node)) {
        skeletonLines.push(getNodeText(node));
        return;
      }

      // 4. Function Declarations (omit body)
      if (ts.isFunctionDeclaration(node)) {
        const modifiers = ts.canHaveModifiers(node) && ts.getModifiers(node)
          ? ts.getModifiers(node)!.map(m => m.getText(sourceFile)).join(' ') + ' '
          : '';
        const name = node.name ? node.name.text : 'anonymous';
        const typeParams = node.typeParameters ? `<${node.typeParameters.map(p => p.getText(sourceFile)).join(', ')}>` : '';
        const params = node.parameters.map(p => p.getText(sourceFile)).join(', ');
        const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';
        skeletonLines.push(`${modifiers}function ${name}${typeParams}(${params})${returnType}; // [body omitted]`);
        return;
      }

      // 5. Variable Statement (e.g., const fn = () => { ... } or const CONSTANT = ...)
      if (ts.isVariableStatement(node)) {
        const modifiers = ts.canHaveModifiers(node) && ts.getModifiers(node)
          ? ts.getModifiers(node)!.map(m => m.getText(sourceFile)).join(' ') + ' '
          : '';
        const declarations = node.declarationList.declarations.map(dec => {
          const varName = dec.name.getText(sourceFile);
          const varType = dec.type ? `: ${dec.type.getText(sourceFile)}` : '';
          
          if (dec.initializer && (ts.isArrowFunction(dec.initializer) || ts.isFunctionExpression(dec.initializer))) {
            const fn = dec.initializer;
            const params = fn.parameters.map(p => p.getText(sourceFile)).join(', ');
            const retType = fn.type ? `: ${fn.type.getText(sourceFile)}` : '';
            return `${varName}${varType} = (${params})${retType} => { /* [omitted] */ }`;
          }
          
          return `${varName}${varType}${dec.initializer ? ' = ...' : ''}`;
        }).join(', ');

        const kind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let';
        skeletonLines.push(`${modifiers}${kind} ${declarations};`);
        return;
      }

      // 6. Class Declarations (extract method/prop signatures, omit bodies)
      if (ts.isClassDeclaration(node)) {
        const modifiers = ts.canHaveModifiers(node) && ts.getModifiers(node)
          ? ts.getModifiers(node)!.map(m => m.getText(sourceFile)).join(' ') + ' '
          : '';
        const name = node.name ? node.name.text : 'AnonymousClass';
        const heritage = node.heritageClauses ? ' ' + node.heritageClauses.map(h => h.getText(sourceFile)).join(' ') : '';
        
        const memberLines: string[] = [];
        for (const member of node.members) {
          const memModifiers = ts.canHaveModifiers(member) && ts.getModifiers(member)
            ? ts.getModifiers(member)!.map(m => m.getText(sourceFile)).join(' ') + ' '
            : '';
          
          if (ts.isPropertyDeclaration(member)) {
            const propName = member.name.getText(sourceFile);
            const propType = member.type ? `: ${member.type.getText(sourceFile)}` : '';
            memberLines.push(`  ${memModifiers}${propName}${propType};`);
          } else if (ts.isMethodDeclaration(member)) {
            const methodName = member.name.getText(sourceFile);
            const params = member.parameters.map(p => p.getText(sourceFile)).join(', ');
            const retType = member.type ? `: ${member.type.getText(sourceFile)}` : '';
            memberLines.push(`  ${memModifiers}${methodName}(${params})${retType};`);
          } else if (ts.isConstructorDeclaration(member)) {
            const params = member.parameters.map(p => p.getText(sourceFile)).join(', ');
            memberLines.push(`  ${memModifiers}constructor(${params});`);
          }
        }

        skeletonLines.push(`${modifiers}class ${name}${heritage} {\n${memberLines.join('\n')}\n}`);
        return;
      }
    });

    const skeletonContent = skeletonLines.join('\n\n');
    const originalLength = sourceCode.length;
    const skeletonLength = skeletonContent.length;
    const savings = originalLength > 0 ? ((originalLength - skeletonLength) / originalLength) * 100 : 0;

    return {
      originalLength,
      skeletonLength,
      tokenSavingsPercent: Math.max(0, Math.round(savings)),
      skeletonContent
    };
  }
}
