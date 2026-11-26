/**
 * @file jit-doc-synthesizer.ts
 * JIT (Just-In-Time) Offline Documentation Synthesizer with Targeted Skeleton Slicing (TSS).
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, readJsonSafe } from '@aegis/shared';
import type { Context7DocEntry } from './context7-types.js';

interface PackageJsonMeta {
  version?: string;
  types?: string;
  typings?: string;
  exports?: { '.'?: { types?: string }; types?: string };
}

export interface ManifestEntry {
  version: string;
  symbols: Record<string, { file: string; line: number }>;
}

export interface UpdateManifestOptions {
  cacheDir: string;
  pkgName: string;
  version: string;
  symbol: string;
  file: string;
  line: number;
}

function readPackageVersion(pkgDir: string): string {
  try {
    const pkg = readJsonSafe<PackageJsonMeta>(path.join(pkgDir, 'package.json'));
    return pkg.version || '1.0.0';
  } catch (err: unknown) {
    debugLogIgnored('jit-doc-synthesizer:version', err);
    return '1.0.0';
  }
}

function updateBraceDepth(line: string, state: { depth: number; foundOpen: boolean }): void {
  for (const ch of line) {
    if (ch === '{') {
      state.depth++;
      state.foundOpen = true;
    } else if (ch === '}') {
      state.depth--;
    }
  }
}

function collectSymbolSlice(lines: string[], startLine: number): string[] {
  const state = { depth: 0, foundOpen: false };
  const slicedLines: string[] = [];
  const endLimit = Math.min(lines.length, startLine + 60);

  for (let i = startLine; i < endLimit; i++) {
    const line = lines[i];
    slicedLines.push(line);
    updateBraceDepth(line, state);
    if (state.foundOpen && state.depth <= 0) break;
    if (!state.foundOpen && line.trim().endsWith(';')) break;
  }
  return slicedLines;
}

export class JitDocSynthesizer {
  public static resolvePackageDir(pkgName: string, startDir = process.cwd()): string | null {
    let cur = path.resolve(startDir);
    while (cur) {
      const candidate = path.join(cur, 'node_modules', pkgName);
      if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'package.json'))) {
        return candidate;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return null;
  }

  public static resolveEntryDeclaration(pkgDir: string): string | null {
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return null;
    try {
      const pkg = readJsonSafe<PackageJsonMeta>(pkgJsonPath);
      const candidate = pkg.types || pkg.typings || pkg.exports?.['.']?.types || pkg.exports?.types;
      if (candidate) {
        const resolved = path.resolve(pkgDir, candidate);
        if (fs.existsSync(resolved)) return resolved;
      }
      const defaultIndex = path.join(pkgDir, 'index.d.ts');
      if (fs.existsSync(defaultIndex)) return defaultIndex;
      const distIndex = path.join(pkgDir, 'dist', 'index.d.ts');
      if (fs.existsSync(distIndex)) return distIndex;
      return null;
    } catch {
      return null;
    }
  }

  public static sliceSymbolByteRange(filePath: string, symbol: string): { slice: string; line: number } | null {
    if (!fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const pat = new RegExp(`(?:export\\s+(?:declare\\s+)?)?(?:const|let|var|class|interface|type|function|namespace)\\s+${symbol}\\b`);
    const startLine = lines.findIndex(line => pat.test(line));
    if (startLine === -1) return null;

    const slicedLines = collectSymbolSlice(lines, startLine);
    return { slice: slicedLines.join('\n'), line: startLine + 1 };
  }

  public static synthesizeDocEntry(
    pkgName: string,
    version: string,
    symbol: string,
    sliceContent: string
  ): Context7DocEntry {
    const lines = sliceContent.split('\n');
    const signatures: string[] = [];
    for (const l of lines) {
      const trimmed = l.trim();
      if (/^(?:export\s+)?(?:declare\s+)?(?:class|interface|type|function|const)\s+/.test(trimmed)) {
        signatures.push(trimmed.replace(/[{;]$/, '').trim());
      } else if (/^[a-zA-Z0-9_$]+\s*\(.*?\)\s*:\s*[^{;]+/.test(trimmed)) {
        signatures.push(trimmed.replace(/[{;]$/, '').trim());
      }
      if (signatures.length >= 5) break;
    }

    return {
      library: pkgName,
      topic: symbol,
      version: version || '1.0.0',
      summary: `JIT-synthesized TypeScript ground-truth contract for ${pkgName}::${symbol}.`,
      signatures: signatures.length > 0 ? signatures : [sliceContent.slice(0, 100).trim()],
      codeExample: sliceContent
    };
  }

  public static updateManifest(options: UpdateManifestOptions): void {
    const { cacheDir, pkgName, version, symbol, file, line } = options;
    const manifestPath = path.join(cacheDir, 'manifest.json');
    let manifest: Record<string, ManifestEntry> = {};
    if (fs.existsSync(manifestPath)) {
      try { manifest = readJsonSafe<Record<string, ManifestEntry>>(manifestPath); } catch { manifest = {}; }
    }
    if (!manifest[pkgName]) {
      manifest[pkgName] = { version, symbols: {} };
    }
    manifest[pkgName].symbols[symbol] = { file, line };
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  public static synthesizeFromNodeModules(
    library: string,
    symbol: string,
    rootDir = process.cwd(),
    cacheDir?: string
  ): Context7DocEntry | null {
    const pkgDir = JitDocSynthesizer.resolvePackageDir(library, rootDir);
    if (!pkgDir) return null;

    const version = readPackageVersion(pkgDir);
    const dtsPath = JitDocSynthesizer.resolveEntryDeclaration(pkgDir);
    if (!dtsPath) return null;

    const sliceResult = JitDocSynthesizer.sliceSymbolByteRange(dtsPath, symbol);
    if (!sliceResult) return null;

    const doc = JitDocSynthesizer.synthesizeDocEntry(library, version, symbol, sliceResult.slice);
    const targetCacheDir = cacheDir || path.resolve(rootDir, '.aegis', 'cache', 'context7');

    try {
      fs.mkdirSync(targetCacheDir, { recursive: true });
      const docPath = path.join(targetCacheDir, `${library}__${symbol}.json`);
      fs.writeFileSync(docPath, JSON.stringify(doc, null, 2), 'utf8');
      JitDocSynthesizer.updateManifest({
        cacheDir: targetCacheDir, pkgName: library, version, symbol, file: dtsPath, line: sliceResult.line
      });
    } catch (err: unknown) {
      debugLogIgnored('jit-doc-synthesizer:cache', err);
    }

    return doc;
  }
}
