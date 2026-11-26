import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface ImportEdges {
  runtime: string[];
  full: string[];
}

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', 'experimental']);

export const toPosix = (p: string): string => p.replace(/\\/g, '/');

export function isProductionTsFile(name: string): boolean {
  if (!name.endsWith('.ts') && !name.endsWith('.tsx')) return false;
  return !name.endsWith('.test.ts') && !name.endsWith('.test.tsx') && !name.endsWith('.d.ts');
}

export function collectProductionTsFiles(rootDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(rootDir)) return results;
  const stack = [path.resolve(rootDir)];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
        stack.push(path.join(dir, entry.name));
      } else if (entry.isFile() && isProductionTsFile(entry.name)) {
        results.push(path.resolve(dir, entry.name));
      }
    }
  }
  return results.sort();
}

export function resolveRelativeImport(
  fromAbs: string,
  specifier: string,
  absToRel: Map<string, string>
): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const raw = path.resolve(path.dirname(fromAbs), specifier);
  const base = raw.replace(/\.(?:jsx?|mjs|cjs)$/, '');
  const candidates = [
    raw,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx')
  ];
  for (const candidate of candidates) {
    const rel = absToRel.get(path.resolve(candidate));
    if (rel !== undefined) return rel;
  }
  return undefined;
}

export function isTypeOnlyImport(stmt: ts.ImportDeclaration): boolean {
  const clause = stmt.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (!clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    const els = clause.namedBindings.elements;
    return els.length > 0 && els.every((el) => el.isTypeOnly);
  }
  return false;
}

export function isTypeOnlyExport(stmt: ts.ExportDeclaration): boolean {
  if (stmt.isTypeOnly) return true;
  if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
    const els = stmt.exportClause.elements;
    return els.length > 0 && els.every((el) => el.isTypeOnly);
  }
  return false;
}

export function extractEdges(
  sf: ts.SourceFile,
  fromAbs: string,
  absToRel: Map<string, string>
): ImportEdges {
  const runtime = new Set<string>();
  const full = new Set<string>();
  for (const stmt of sf.statements) {
    const isImp = ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier);
    const isExp =
      ts.isExportDeclaration(stmt) &&
      stmt.moduleSpecifier !== undefined &&
      ts.isStringLiteral(stmt.moduleSpecifier);
    if (!isImp && !isExp) continue;
    const spec = isImp
      ? (stmt as ts.ImportDeclaration).moduleSpecifier
      : (stmt as ts.ExportDeclaration).moduleSpecifier!;
    const target = resolveRelativeImport(fromAbs, (spec as ts.StringLiteral).text, absToRel);
    if (!target) continue;
    full.add(target);
    const typeOnly = isImp
      ? isTypeOnlyImport(stmt as ts.ImportDeclaration)
      : isTypeOnlyExport(stmt as ts.ExportDeclaration);
    if (!typeOnly) runtime.add(target);
  }
  return { runtime: [...runtime].sort(), full: [...full].sort() };
}

interface CycleSearchState {
  graph: Map<string, string[]>;
  indexMap: Map<string, number>;
  seen: Set<string>;
  cycles: string[][];
  maxCycles: number;
}

function searchCyclesFrom(
  state: CycleSearchState,
  startIdx: number,
  current: string,
  pathStack: string[],
  onPath: Set<string>
): void {
  if (state.cycles.length >= state.maxCycles) return;
  for (const next of state.graph.get(current) ?? []) {
    const nextIdx = state.indexMap.get(next);
    if (nextIdx === undefined || nextIdx < startIdx) continue;
    if (nextIdx === startIdx) {
      const closed = [...pathStack, next];
      const key = closed.join(' -> ');
      if (!state.seen.has(key)) {
        state.seen.add(key);
        state.cycles.push(closed);
      }
      continue;
    }
    if (onPath.has(next)) continue;
    onPath.add(next);
    pathStack.push(next);
    searchCyclesFrom(state, startIdx, next, pathStack, onPath);
    pathStack.pop();
    onPath.delete(next);
  }
}

export function findCyclesInGraph(graph: Map<string, string[]>): string[][] {
  const nodes = [...graph.keys()].sort();
  const state: CycleSearchState = {
    graph,
    indexMap: new Map(nodes.map((n, i) => [n, i])),
    seen: new Set<string>(),
    cycles: [],
    maxCycles: 200
  };
  for (let i = 0; i < nodes.length && state.cycles.length < state.maxCycles; i++) {
    searchCyclesFrom(state, i, nodes[i], [nodes[i]], new Set([nodes[i]]));
  }
  return state.cycles;
}
