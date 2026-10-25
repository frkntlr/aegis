import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { TsCallGraphExtractor } from './ts-call-graph-extractor.js';
import type { SymbolIndexer } from './symbol-indexer.js';

export interface AmbientTypeClosure {
  typeNames: string[];
  declarations: string[];
  formattedBlock: string;
}

export interface TypeResolverOptions {
  indexer?: SymbolIndexer;
  baseDir?: string;
  sourceFileProvider?: (filePath: string) => string | null;
}

const BUILTIN_TYPES = new Set([
  'string', 'number', 'boolean', 'void', 'any', 'unknown', 'never', 'null', 'undefined',
  'Promise', 'Record', 'Array', 'Map', 'Set', 'Error', 'Date', 'RegExp', 'Partial',
  'Required', 'Readonly', 'Omit', 'Pick', 'Exclude', 'Extract', 'NonNullable',
  'ReturnType', 'InstanceType', 'Parameters', 'ConstructorParameters', 'object',
  'Function', 'symbol', 'bigint', 'true', 'false', 'T', 'K', 'V', 'R'
]);

export class TransitiveTypeResolver {
  private options: TypeResolverOptions;

  constructor(options: TypeResolverOptions = {}) {
    this.options = options;
  }

  public static extractTypeIdentifiers(typeText: string): string[] {
    const rawMatches = typeText.match(/\b[A-Z]\w*\b/g) || [];
    const filtered = rawMatches.filter(name => !BUILTIN_TYPES.has(name));
    return [...new Set(filtered)];
  }

  private collectFunctionTypeNames(node: ts.Node, sf: ts.SourceFile): string[] {
    const typeNames: string[] = [];
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      for (const param of node.parameters) {
        if (param.type) {
          typeNames.push(...TransitiveTypeResolver.extractTypeIdentifiers(param.type.getText(sf)));
        }
      }
      if (node.type) {
        typeNames.push(...TransitiveTypeResolver.extractTypeIdentifiers(node.type.getText(sf)));
      }
    }
    return [...new Set(typeNames)];
  }

  private findTargetNode(sf: ts.SourceFile, symbolName: string): ts.Node | null {
    let found: ts.Node | null = null;
    const walk = (n: ts.Node): void => {
      if (found) return;
      if (
        (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) &&
        n.name && n.name.getText(sf) === symbolName
      ) {
        found = n;
        return;
      }
      if (ts.isVariableDeclaration(n) && n.name.getText(sf) === symbolName && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
        found = n.initializer;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return found;
  }

  public findDeclarationInSource(sf: ts.SourceFile, typeName: string): string | null {
    for (const stmt of sf.statements) {
      if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === typeName) return stmt.getText(sf);
      if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === typeName) return stmt.getText(sf);
      if (ts.isEnumDeclaration(stmt) && stmt.name.text === typeName) return stmt.getText(sf);
      if (ts.isClassDeclaration(stmt) && stmt.name?.text === typeName) return stmt.getText(sf);
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

  private resolveImportedDeclaration(typeName: string, targetPath: string): string | null {
    const content = this.readTargetFile(targetPath);
    if (!content) return null;
    const sf = ts.createSourceFile(targetPath, content, ts.ScriptTarget.Latest, true);
    return this.findDeclarationInSource(sf, typeName);
  }

  public resolveAmbientClosure(symbolName: string, filePath: string, sourceCode: string): AmbientTypeClosure {
    const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    const targetNode = this.findTargetNode(sf, symbolName);
    if (!targetNode) {
      return { typeNames: [], declarations: [], formattedBlock: '' };
    }

    const typeNames = this.collectFunctionTypeNames(targetNode, sf);
    const imports = TsCallGraphExtractor.collectImports(sf, filePath);
    const declarations: string[] = [];

    for (const typeName of typeNames) {
      const localDecl = this.findDeclarationInSource(sf, typeName);
      if (localDecl) {
        declarations.push(localDecl);
        continue;
      }
      const binding = imports.get(typeName);
      if (binding) {
        const importedDecl = this.resolveImportedDeclaration(binding.importedName === 'default' ? typeName : binding.importedName, binding.targetFilePath);
        if (importedDecl) declarations.push(importedDecl);
      }
    }

    const formattedBlock = declarations.length > 0
      ? `// 📦 [Ambient Type Closure - Param & Return Types]\n${declarations.join('\n\n')}`
      : '';

    return { typeNames, declarations, formattedBlock };
  }
}
