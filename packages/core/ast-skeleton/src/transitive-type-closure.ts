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

export interface TypeClosureOptions {
  maxDepth?: number;
  lineBudget?: number;
  enableOpaqueStubbing?: boolean;
  baseDir?: string;
  sourceFileProvider?: (filePath: string) => string | null;
}

export interface BoundedTypeClosureResult {
  fullDeclarations: string[];
  opaqueStubs: string[];
  monomorphizedTypes: string[];
  formattedBlock: string;
  exceededBudget: boolean;
  totalLines: number;
}

const BUILTIN_TYPES = new Set(
  ('string number boolean void any unknown never null undefined Promise Record Array Map Set Error Date RegExp ' +
  'Partial Required Readonly Omit Pick Exclude Extract NonNullable ReturnType InstanceType Parameters ' +
  'ConstructorParameters object Function symbol bigint true false T K V R Buffer ArrayBuffer Uint8Array ' +
  'ReadableStream WritableStream URL URLSearchParams Headers Request Response AbortSignal Blob File FormData ' +
  'Iterable AsyncIterable Iterator AsyncIterator ReadonlyArray ReadonlyMap ReadonlySet ChildProcess NodeJS Event'
  ).split(' ')
);

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
    const rawMatches = typeText.match(/\b[A-Z]\w*\b/g) || [];
    return [...new Set(rawMatches.filter(name => !BUILTIN_TYPES.has(name)))];
  }

  public static generateOpaqueStub(typeName: string): string {
    return `export type ${typeName} = { readonly __opaque: '${typeName}' };`;
  }

  public static monomorphizeGeneric(typeName: string, genericArgs: string[]): string {
    if (genericArgs.length === 0) return typeName;
    const cleanArgs = genericArgs.map(a => a.replace(/[^a-zA-Z0-9_]/g, '')).join('_');
    return `${typeName}_${cleanArgs}`;
  }

  private readTargetFile(targetPath: string): string | null {
    const custom = this.options.sourceFileProvider(targetPath);
    if (custom !== null) return custom;
    const full = path.isAbsolute(targetPath) ? targetPath : path.resolve(this.options.baseDir, targetPath);
    if (fs.existsSync(full)) {
      try {
        return fs.readFileSync(full, 'utf8');
      } catch {
        return null;
      }
    }
    return null;
  }

  private findDeclInSource(sf: ts.SourceFile, typeName: string): string | null {
    for (const stmt of sf.statements) {
      if (
        (ts.isInterfaceDeclaration(stmt) && stmt.name.text === typeName) ||
        (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === typeName) ||
        (ts.isEnumDeclaration(stmt) && stmt.name.text === typeName) ||
        (ts.isClassDeclaration(stmt) && stmt.name?.text === typeName)
      ) {
        return stmt.getText(sf);
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
      let targetSf = fileCache.get(targetPath);
      if (!targetSf) {
        const code = this.readTargetFile(targetPath);
        if (!code) continue;
        targetSf = ts.createSourceFile(targetPath, code, ts.ScriptTarget.Latest, true);
        fileCache.set(targetPath, targetSf);
      }
      const decl = this.findDeclInSource(targetSf, typeName);
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
    const local = this.findDeclInSource(currentSf, typeName);
    if (local) return { decl: local, sf: currentSf, path: currentPath };

    const imports = TsCallGraphExtractor.collectImports(currentSf, currentPath);
    const binding = imports.get(typeName);
    if (!binding) return this.resolveReExport(currentSf, typeName, currentPath, fileCache);

    let targetSf = fileCache.get(binding.targetFilePath);
    if (!targetSf) {
      const code = this.readTargetFile(binding.targetFilePath);
      if (code) {
        targetSf = ts.createSourceFile(binding.targetFilePath, code, ts.ScriptTarget.Latest, true);
        fileCache.set(binding.targetFilePath, targetSf);
      }
    }

    if (targetSf) {
      const q = binding.importedName === 'default' ? typeName : binding.importedName;
      const decl = this.findDeclInSource(targetSf, q);
      if (decl) return { decl, sf: targetSf, path: binding.targetFilePath };
      const reExported = this.resolveReExport(targetSf, q, binding.targetFilePath, fileCache);
      if (reExported) return reExported;
    }
    return null;
  }

  private findTargetNode(sf: ts.SourceFile, symbolName: string): ts.Node | null {
    const target = symbolName.includes('.') ? symbolName.split('.').pop()! : symbolName;
    let found: ts.Node | null = null;
    const walk = (n: ts.Node): void => {
      if (found) return;
      if (
        (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) &&
        n.name?.getText(sf) === target
      ) {
        found = n;
        return;
      }
      if (
        ts.isVariableDeclaration(n) &&
        n.name.getText(sf) === target &&
        n.initializer &&
        (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
      ) {
        found = n.initializer;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return found;
  }

  private collectSignatures(node: ts.Node, sf: ts.SourceFile): string[] {
    const names: string[] = [];
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      for (const p of node.parameters) {
        if (p.type) names.push(...TransitiveTypeClosure.extractTypeIdentifiers(p.type.getText(sf)));
      }
      if (node.type) {
        names.push(...TransitiveTypeClosure.extractTypeIdentifiers(node.type.getText(sf)));
      }
    }
    return [...new Set(names)];
  }

  public resolveClosure(
    symbolName: string,
    filePath: string,
    sourceCode: string
  ): BoundedTypeClosureResult {
    const sf = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    const targetNode = this.findTargetNode(sf, symbolName);
    if (!targetNode) return this.emptyResult();

    const fileCache = new Map<string, ts.SourceFile>([[filePath, sf]]);
    const firstDegree = this.collectSignatures(targetNode, sf);
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
          this.processTransitiveTypes(nested, visited, opaqueStubs, monomorphizedTypes);
        }
      } else if (this.options.enableOpaqueStubbing) {
        opaqueStubs.push(TransitiveTypeClosure.generateOpaqueStub(name));
      }
    }

    return this.buildResult(fullDeclarations, opaqueStubs, monomorphizedTypes);
  }

  private processTransitiveTypes(
    typeNames: string[],
    visited: Set<string>,
    opaqueStubs: string[],
    monomorphizedTypes: string[]
  ): void {
    for (const t of typeNames) {
      if (visited.has(t)) continue;
      visited.add(t);
      if (t.includes('<') && t.includes('>')) {
        const mono = TransitiveTypeClosure.monomorphizeGeneric(t.split('<')[0]!, ['T']);
        monomorphizedTypes.push(`export type ${mono} = { readonly __monomorphized: true };`);
      } else if (this.options.enableOpaqueStubbing) {
        opaqueStubs.push(TransitiveTypeClosure.generateOpaqueStub(t));
      }
    }
  }

  private emptyResult(): BoundedTypeClosureResult {
    return {
      fullDeclarations: [], opaqueStubs: [], monomorphizedTypes: [],
      formattedBlock: '', exceededBudget: false, totalLines: 0
    };
  }

  private buildResult(
    fullDecls: string[],
    stubs: string[],
    mono: string[]
  ): BoundedTypeClosureResult {
    const lines: string[] = [];
    if (fullDecls.length > 0) {
      lines.push('// 📦 [1st-Degree Concrete Type Surface]', ...fullDecls);
    }
    if (stubs.length > 0) {
      lines.push('// 🛡️ [Transitive Opaque Stubs - Zero Context Bloat]', ...stubs);
    }
    if (mono.length > 0) {
      lines.push('// ⚡ [Monomorphized Call-Site Generic Types]', ...mono);
    }

    const totalLines = lines.join('\n').split('\n').length;
    const exceededBudget = totalLines > this.options.lineBudget;

    let formattedBlock: string;
    if (exceededBudget) {
      const summary = [
        `// ⚠️ [Token Guardrail] Type closure (${totalLines} lines) exceeded budget (${this.options.lineBudget}).`,
        '// Collapsed to opaque stubs to protect context window:',
        ...stubs
      ];
      formattedBlock = summary.join('\n');
    } else {
      formattedBlock = lines.join('\n\n');
    }

    return {
      fullDeclarations: fullDecls,
      opaqueStubs: stubs,
      monomorphizedTypes: mono,
      formattedBlock,
      exceededBudget,
      totalLines
    };
  }
}
