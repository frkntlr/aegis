/**
 * @file jit-doc-synthesizer.ts
 * JIT (Just-In-Time) Offline Documentation Synthesizer with Targeted Skeleton Slicing (TSS).
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Context7DocEntry } from './context7-bridge.js';

export interface ManifestEntry {
  version: string;
  symbols: Record<string, { file: string; line: number }>;
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
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
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
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const pat = new RegExp(`(?:export\\s+(?:declare\\s+)?)?(?:const|let|var|class|interface|type|function|namespace)\\s+${symbol}\\b`);

    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (pat.test(lines[i])) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) return null;

    let braceDepth = 0;
    let foundOpen = false;
    const slicedLines: string[] = [];

    for (let i = startLine; i < lines.length && i < startLine + 60; i++) {
      const line = lines[i];
      slicedLines.push(line);
      for (const ch of line) {
        if (ch === '{') { braceDepth++; foundOpen = true; }
        else if (ch === '}') { braceDepth--; }
      }
      if (foundOpen && braceDepth <= 0) break;
      if (!foundOpen && line.trim().endsWith(';')) break;
    }

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

  public static updateManifest(
    cacheDir: string,
    pkgName: string,
    version: string,
    symbol: string,
    file: string,
    line: number
  ): void {
    const manifestPath = path.join(cacheDir, 'manifest.json');
    let manifest: Record<string, ManifestEntry> = {};
    if (fs.existsSync(manifestPath)) {
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { manifest = {}; }
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

    let version = '1.0.0';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      version = pkg.version || '1.0.0';
    } catch { /* ignore */ }

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
      JitDocSynthesizer.updateManifest(targetCacheDir, library, version, symbol, dtsPath, sliceResult.line);
    } catch { /* ignore */ }

    return doc;
  }
}
