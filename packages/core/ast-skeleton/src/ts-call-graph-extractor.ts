import * as path from 'node:path';
import ts from 'typescript';

export interface SymbolCallEdge {
  from: string;
  to: string;
  type: 'CALLS_SYMBOL' | 'INSTANTIATES' | 'REFERENCES_TYPE';
}

export interface TsImportBinding {
  localName: string;
  importedName: string;
  targetFilePath: string;
}

export class TsCallGraphExtractor {
  public static resolveImportPath(currentFilePath: string, specifier: string): string {
    if (!specifier.startsWith('.')) return specifier;
    const dir = path.posix.dirname(currentFilePath.replace(/\\/g, '/'));
    const raw = path.posix.normalize(path.posix.join(dir, specifier));
    const normalized = raw.replace(/\.jsx?$/, '.ts').replace(/\.mjsx?$/, '.mts').replace(/\.cjsx?$/, '.cts');
    return path.posix.extname(normalized) ? normalized : `${normalized}.ts`;
  }

  public static collectImports(sf: ts.SourceFile, currentFilePath: string): Map<string, TsImportBinding> {
    const imports = new Map<string, TsImportBinding>();
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      const targetPath = TsCallGraphExtractor.resolveImportPath(currentFilePath, stmt.moduleSpecifier.text);
      const clause = stmt.importClause;
      if (!clause) continue;
      if (clause.name) {
        imports.set(clause.name.text, { localName: clause.name.text, importedName: 'default', targetFilePath: targetPath });
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const importedName = el.propertyName ? el.propertyName.text : el.name.text;
          imports.set(el.name.text, { localName: el.name.text, importedName, targetFilePath: targetPath });
        }
      }
    }
    return imports;
  }

  public static extractCallEdges(filePath: string, sourceCode: string): SymbolCallEdge[] {
    const normPath = filePath.replace(/\\/g, '/');
    const sf = ts.createSourceFile(normPath, sourceCode, ts.ScriptTarget.Latest, true);
    const imports = TsCallGraphExtractor.collectImports(sf, normPath);
    const edges: SymbolCallEdge[] = [];

    const visit = (node: ts.Node, currentCaller?: string, currentClass?: string) => {
      let caller = currentCaller;
      let cls = currentClass;

      if (ts.isClassDeclaration(node) && node.name) {
        cls = node.name.text;
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        caller = `${normPath}::${node.name.text}`;
      } else if (ts.isMethodDeclaration(node) && node.name && cls) {
        caller = `${normPath}::${cls}.${node.name.getText(sf)}`;
      }

      if (caller) {
        TsCallGraphExtractor.checkNodeCall(node, normPath, caller, cls, imports, edges);
      }

      ts.forEachChild(node, child => visit(child, caller, cls));
    };

    visit(sf);
    return edges;
  }

  private static checkNodeCall(
    node: ts.Node,
    filePath: string,
    caller: string,
    currentClass: string | undefined,
    imports: Map<string, TsImportBinding>,
    out: SymbolCallEdge[]
  ): void {
    if (ts.isCallExpression(node)) {
      TsCallGraphExtractor.resolveCall(node.expression, filePath, caller, currentClass, imports, out);
    } else if (ts.isNewExpression(node)) {
      TsCallGraphExtractor.resolveNew(node.expression, filePath, caller, imports, out);
    } else if (ts.isTypeReferenceNode(node)) {
      TsCallGraphExtractor.resolveTypeRef(node.typeName, filePath, caller, imports, out);
    }
  }

  private static resolveCall(
    expr: ts.Expression,
    filePath: string,
    caller: string,
    currentClass: string | undefined,
    imports: Map<string, TsImportBinding>,
    out: SymbolCallEdge[]
  ): void {
    if (ts.isIdentifier(expr)) {
      const name = expr.text;
      const imp = imports.get(name);
      const to = imp ? `${imp.targetFilePath}::${imp.importedName}` : `${filePath}::${name}`;
      if (to !== caller) out.push({ from: caller, to, type: 'CALLS_SYMBOL' });
    } else if (ts.isPropertyAccessExpression(expr)) {
      if (expr.expression.kind === ts.SyntaxKind.ThisKeyword && currentClass) {
        const to = `${filePath}::${currentClass}.${expr.name.text}`;
        if (to !== caller) out.push({ from: caller, to, type: 'CALLS_SYMBOL' });
      } else if (ts.isIdentifier(expr.expression)) {
        const objName = expr.expression.text;
        const imp = imports.get(objName);
        if (imp) out.push({ from: caller, to: `${imp.targetFilePath}::${expr.name.text}`, type: 'CALLS_SYMBOL' });
      }
    }
  }

  private static resolveNew(
    expr: ts.Expression,
    filePath: string,
    caller: string,
    imports: Map<string, TsImportBinding>,
    out: SymbolCallEdge[]
  ): void {
    if (ts.isIdentifier(expr)) {
      const name = expr.text;
      const imp = imports.get(name);
      const to = imp ? `${imp.targetFilePath}::${imp.importedName}` : `${filePath}::${name}`;
      out.push({ from: caller, to, type: 'INSTANTIATES' });
    }
  }

  private static resolveTypeRef(
    typeName: ts.EntityName,
    filePath: string,
    caller: string,
    imports: Map<string, TsImportBinding>,
    out: SymbolCallEdge[]
  ): void {
    if (ts.isIdentifier(typeName)) {
      const name = typeName.text;
      if (['string', 'number', 'boolean', 'void', 'any', 'unknown', 'Promise', 'Record', 'Array', 'Map', 'Set'].includes(name)) return;
      const imp = imports.get(name);
      const to = imp ? `${imp.targetFilePath}::${imp.importedName}` : `${filePath}::${name}`;
      out.push({ from: caller, to, type: 'REFERENCES_TYPE' });
    }
  }
}
