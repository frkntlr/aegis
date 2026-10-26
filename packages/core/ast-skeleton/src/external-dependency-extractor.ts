/**
 * @file external-dependency-extractor.ts
 * Extracts external framework and library dependencies from AST code across TypeScript, GDScript, and C#.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface ExternalSymbolRef {
  symbol: string;
  library: string;
  kind: 'import' | 'extends' | 'implements' | 'preload';
  isExternal: boolean;
  rawSpecifier: string;
  filePath?: string;
}

export class ExternalDependencyExtractor {
  public static isExternalSpecifier(specifier: string): boolean {
    const trimmed = specifier.trim();
    if (trimmed.startsWith('.') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
      return false;
    }
    if (trimmed.startsWith('res://') || trimmed.startsWith('user://')) {
      return false;
    }
    return trimmed.length > 0;
  }

  public static normalizeLibraryName(specifier: string): string {
    const clean = specifier.trim().replace(/^['"]|['"]$/g, '');
    if (clean.startsWith('@')) {
      const parts = clean.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : clean;
    }
    return clean.split('/')[0];
  }

  private static parseNamedImports(rawNamed: string, lib: string, rawSpec: string, isExt: boolean, fp?: string): ExternalSymbolRef[] {
    const refs: ExternalSymbolRef[] = [];
    const items = rawNamed.split(',').map(s => s.trim()).filter(Boolean);
    for (const item of items) {
      const cleanItem = item.replace(/^type\s+/, '').trim();
      const parts = cleanItem.split(/\s+as\s+/);
      const symbol = (parts[1] || parts[0]).trim();
      refs.push({ symbol, library: lib, kind: 'import', isExternal: isExt, rawSpecifier: rawSpec, filePath: fp });
    }
    return refs;
  }

  private static extractTsImportLine(line: string, fp?: string): ExternalSymbolRef[] {
    const refs: ExternalSymbolRef[] = [];
    const match = line.match(/import\s+(?:(?:type\s+)?([\w$]+)|\*\s+as\s+([\w$]+)|(?:\{([^}]+)\}))?\s*(?:from\s*)?['"]([^'"]+)['"]/);
    if (!match) return refs;
    const [, defaultSpec, starSpec, namedSpec, rawSpec] = match;
    const isExt = ExternalDependencyExtractor.isExternalSpecifier(rawSpec);
    const lib = ExternalDependencyExtractor.normalizeLibraryName(rawSpec);

    if (defaultSpec) {
      refs.push({ symbol: defaultSpec.trim(), library: lib, kind: 'import', isExternal: isExt, rawSpecifier: rawSpec, filePath: fp });
    }
    if (starSpec) {
      refs.push({ symbol: starSpec.trim(), library: lib, kind: 'import', isExternal: isExt, rawSpecifier: rawSpec, filePath: fp });
    }
    if (namedSpec) {
      refs.push(...ExternalDependencyExtractor.parseNamedImports(namedSpec, lib, rawSpec, isExt, fp));
    }
    return refs;
  }

  public static extractTypeScript(content: string, filePath?: string): ExternalSymbolRef[] {
    const refs: ExternalSymbolRef[] = [];
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('import ') || line.startsWith('import(')) {
        refs.push(...ExternalDependencyExtractor.extractTsImportLine(line, filePath));
      }
      const reqMatch = line.match(/(?:const|let|var)\s+([\w${}\s,]+)\s*=\s*require\(['"]([^'"]+)['"]\)/);
      if (reqMatch) {
        const [, varPart, rawSpec] = reqMatch;
        const isExt = ExternalDependencyExtractor.isExternalSpecifier(rawSpec);
        const lib = ExternalDependencyExtractor.normalizeLibraryName(rawSpec);
        if (varPart.includes('{')) {
          const inner = varPart.replace(/[{}]/g, '');
          refs.push(...ExternalDependencyExtractor.parseNamedImports(inner, lib, rawSpec, isExt, filePath));
        } else {
          refs.push({ symbol: varPart.trim(), library: lib, kind: 'import', isExternal: isExt, rawSpecifier: rawSpec, filePath });
        }
      }
    }
    return refs;
  }

  public static extractGDScript(content: string, filePath?: string): ExternalSymbolRef[] {
    const refs: ExternalSymbolRef[] = [];
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('#')) continue;

      const extMatch = line.match(/^extends\s+([A-Za-z0-9_]+)/);
      if (extMatch) {
        const cls = extMatch[1];
        const isExt = !line.includes('"res://');
        refs.push({ symbol: cls, library: isExt ? 'godot4' : 'res', kind: 'extends', isExternal: isExt, rawSpecifier: cls, filePath });
      }

      const preloadMatch = line.match(/preload\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      if (preloadMatch) {
        for (const p of preloadMatch) {
          const pathMatch = p.match(/['"]([^'"]+)['"]/);
          if (pathMatch) {
            const rawSpec = pathMatch[1];
            refs.push({ symbol: rawSpec, library: 'res', kind: 'preload', isExternal: false, rawSpecifier: rawSpec, filePath });
          }
        }
      }
    }
    return refs;
  }

  public static extractCSharp(content: string, filePath?: string): ExternalSymbolRef[] {
    const refs: ExternalSymbolRef[] = [];
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('//')) continue;

      const usingMatch = line.match(/^using\s+([A-Za-z0-9_.]+);/);
      if (usingMatch) {
        const ns = usingMatch[1];
        const isExt = !ns.startsWith('Local.') && !ns.startsWith('Project.');
        refs.push({ symbol: ns, library: ns.split('.')[0], kind: 'import', isExternal: isExt, rawSpecifier: ns, filePath });
      }

      const classMatch = line.match(/class\s+\w+\s*:\s*([A-Za-z0-9_.,\s]+)/);
      if (classMatch) {
        const bases = classMatch[1].split(',').map(b => b.trim()).filter(Boolean);
        for (const b of bases) {
          refs.push({ symbol: b, library: 'dotnet', kind: 'extends', isExternal: true, rawSpecifier: b, filePath });
        }
      }
    }
    return refs;
  }

  public static extract(filePath: string, content: string): ExternalSymbolRef[] {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs') {
      return ExternalDependencyExtractor.extractTypeScript(content, filePath);
    }
    if (ext === '.gd') {
      return ExternalDependencyExtractor.extractGDScript(content, filePath);
    }
    if (ext === '.cs') {
      return ExternalDependencyExtractor.extractCSharp(content, filePath);
    }
    return [];
  }
}
