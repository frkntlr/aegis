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
    const targetName = symbolName.includes('.') ? symbolName.split('.').pop()! : symbolName;
    let found: ts.Node | null = null;
    const walk = (n: ts.Node): void => {
      if (found) return;
      if (
        (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) &&
        n.name && n.name.getText(sf) === targetName
      ) {
        found = n;
        return;
      }
      if (ts.isVariableDeclaration(n) && n.name.getText(sf) === targetName && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
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

  private resolveTypeDeclaration(
    typeName: string,
    currentSf: ts.SourceFile,
    currentPath: string,
    fileCache: Map<string, ts.SourceFile>
  ): { decl: string; sf: ts.SourceFile; path: string } | null {
    const localDecl = this.findDeclarationInSource(currentSf, typeName);
    if (localDecl) return { decl: localDecl, sf: currentSf, path: currentPath };

    const imports = TsCallGraphExtractor.collectImports(currentSf, currentPath);
    const binding = imports.get(typeName);
    if (binding) {
      let targetSf = fileCache.get(binding.targetFilePath);
      if (!targetSf) {
        const content = this.readTargetFile(binding.targetFilePath);
        if (content) {
          targetSf = ts.createSourceFile(binding.targetFilePath, content, ts.ScriptTarget.Latest, true);
          fileCache.set(binding.targetFilePath, targetSf);
        }
      }
      if (targetSf) {
        const queryName = binding.importedName === 'default' ? typeName : binding.importedName;
        const importedDecl = this.findDeclarationInSource(targetSf, queryName);
        if (importedDecl) return { decl: importedDecl, sf: targetSf, path: binding.targetFilePath };
      }
    }
    return null;
  }

  private expandTypeItem(
    item: { name: string; sf: ts.SourceFile; path: string },
    fileCache: Map<string, ts.SourceFile>,
    visited: Set<string>,
    declarations: string[]
  ): { name: string; sf: ts.SourceFile; path: string }[] {
    const resolved = this.resolveTypeDeclaration(item.name, item.sf, item.path, fileCache);
    if (!resolved) return [];
    declarations.push(resolved.decl);
    const next: { name: string; sf: ts.SourceFile; path: string }[] = [];
    for (const nested of TransitiveTypeResolver.extractTypeIdentifiers(resolved.decl)) {
      if (!visited.has(nested)) next.push({ name: nested, sf: resolved.sf, path: resolved.path });
    }
    return next;
  }

  public resolveAmbientClosure(
    symbolName: string,
    filePath: string,
    sourceCode: string,
    maxDepth = 3
  ): AmbientTypeClosure {
    const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    const targetNode = this.findTargetNode(sf, symbolName);
    if (!targetNode) return { typeNames: [], declarations: [], formattedBlock: '' };

    const fileCache = new Map<string, ts.SourceFile>([[filePath, sf]]);
    const initialTypes = this.collectFunctionTypeNames(targetNode, sf);
    const visited = new Set<string>();
    const declarations: string[] = [];
    const resolvedTypeNames: string[] = [];

    let currentLevel = initialTypes.map(name => ({ name, sf, path: filePath }));
    let depth = 0;

    while (currentLevel.length > 0 && depth < maxDepth) {
      const nextLevel: { name: string; sf: ts.SourceFile; path: string }[] = [];
      for (const item of currentLevel) {
        if (visited.has(item.name)) continue;
        visited.add(item.name);
        resolvedTypeNames.push(item.name);
        nextLevel.push(...this.expandTypeItem(item, fileCache, visited, declarations));
      }
      currentLevel = nextLevel;
      depth++;
    }

    const formattedBlock = declarations.length > 0
      ? `// 📦 [Ambient Type Closure - Param & Return Types]\n${declarations.join('\n\n')}`
      : '';
    return { typeNames: resolvedTypeNames, declarations, formattedBlock };
  }
}
