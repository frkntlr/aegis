/**
 * @file transitive-type-closure.ts
 * Bounded Depth Transitive Type Closure with Opaque Stubbing & Monomorphized Slicing.
 * Prevents context bloat and memory leaks in large polyglot symbol graphs.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { TsCallGraphExtractor } from './ts-call-graph-extractor.js';
import {
  type TypeClosureOptions,
  type BoundedTypeClosureResult,
  TransitiveTypeUtils
} from './transitive-type-utils.js';
import {
  buildClosureResult,
  collectSignatures,
  emptyClosureResult,
  findDeclInSource,
  findTargetNode,
  loadCachedSourceFile,
  processTransitiveTypes
} from './transitive-type-collector.js';

export type { TypeClosureOptions, BoundedTypeClosureResult };

export class TransitiveTypeClosure {
  private readonly options: Required<TypeClosureOptions>;

  constructor(options: TypeClosureOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 1,
      lineBudget: options.lineBudget ?? 200,
      enableOpaqueStubbing: options.enableOpaqueStubbing ?? true,
      baseDir: options.baseDir ?? process.cwd(),
      sourceFileProvider: options.sourceFileProvider ?? (() => null)
    };
  }

  public static extractTypeIdentifiers(typeText: string): string[] {
    return TransitiveTypeUtils.extractTypeIdentifiers(typeText);
  }

  public static generateOpaqueStub(typeName: string): string {
    return TransitiveTypeUtils.generateOpaqueStub(typeName);
  }

  public static monomorphizeGeneric(typeName: string, genericArgs: string[]): string {
    return TransitiveTypeUtils.monomorphizeGeneric(typeName, genericArgs);
  }

  private readTargetFile(targetPath: string): string | null {
    const custom = this.options.sourceFileProvider(targetPath);
    if (custom !== null) return custom;
    const full = path.isAbsolute(targetPath) ? targetPath : path.resolve(this.options.baseDir, targetPath);
    if (fs.existsSync(full)) {
      try {
        return fs.readFileSync(full, 'utf8');
      } catch {
        // Unreadable target file; skip resolution
        return null;
      }
    }
    return null;
  }

  private resolveReExport(
    sf: ts.SourceFile,
    typeName: string,
    curPath: string,
    fileCache: Map<string, ts.SourceFile>
  ): { decl: string; sf: ts.SourceFile; path: string } | null {
    for (const stmt of sf.statements) {
      if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      const named = stmt.exportClause && ts.isNamedExports(stmt.exportClause);
      const isMatch = (named && stmt.exportClause.elements.some(e => e.name.text === typeName)) || !stmt.exportClause;
      if (!isMatch) continue;
      const targetPath = TsCallGraphExtractor.resolveImportPath(curPath, stmt.moduleSpecifier.text);
      if (!targetPath) continue;
      const targetSf = loadCachedSourceFile(targetPath, fileCache, p => this.readTargetFile(p));
      if (!targetSf) continue;
      const decl = findDeclInSource(targetSf, typeName);
      if (decl) return { decl, sf: targetSf, path: targetPath };
    }
    return null;
  }

  private resolveFirstDegree(
    typeName: string,
    currentSf: ts.SourceFile,
    currentPath: string,
    fileCache: Map<string, ts.SourceFile>
  ): { decl: string; sf: ts.SourceFile; path: string } | null {
    const local = findDeclInSource(currentSf, typeName);
    if (local) return { decl: local, sf: currentSf, path: currentPath };

    const imports = TsCallGraphExtractor.collectImports(currentSf, currentPath);
    const binding = imports.get(typeName);
    if (!binding) return this.resolveReExport(currentSf, typeName, currentPath, fileCache);

    const targetSf = loadCachedSourceFile(binding.targetFilePath, fileCache, p => this.readTargetFile(p));
    if (!targetSf) return null;

    const queryName = binding.importedName === 'default' ? typeName : binding.importedName;
    const decl = findDeclInSource(targetSf, queryName);
    if (decl) return { decl, sf: targetSf, path: binding.targetFilePath };
    return this.resolveReExport(targetSf, queryName, binding.targetFilePath, fileCache);
  }

  public resolveClosure(
    symbolName: string,
    filePath: string,
    sourceCode: string
  ): BoundedTypeClosureResult {
    const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    const targetNode = findTargetNode(sf, symbolName);
    if (!targetNode) return emptyClosureResult();

    const fileCache = new Map<string, ts.SourceFile>([[filePath, sf]]);
    const firstDegree = collectSignatures(targetNode, sf);
    const fullDeclarations: string[] = [];
    const opaqueStubs: string[] = [];
    const monomorphizedTypes: string[] = [];
    const visited = new Set<string>();

    for (const name of firstDegree) {
      visited.add(name);
      const res = this.resolveFirstDegree(name, sf, filePath, fileCache);
      if (res) {
        fullDeclarations.push(res.decl);
        if (this.options.maxDepth > 0) {
          const nested = TransitiveTypeClosure.extractTypeIdentifiers(res.decl);
          processTransitiveTypes(nested, visited, opaqueStubs, monomorphizedTypes, this.options.enableOpaqueStubbing);
        }
      } else if (this.options.enableOpaqueStubbing) {
        opaqueStubs.push(TransitiveTypeClosure.generateOpaqueStub(name));
      }
    }

    return buildClosureResult(fullDeclarations, opaqueStubs, monomorphizedTypes, this.options.lineBudget);
  }
}
