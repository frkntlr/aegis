import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type SymbolEntry, SymbolParser } from './symbol-parser.js';
import { FuzzyMatcher } from './fuzzy-matcher.js';

export { type SymbolEntry } from './symbol-parser.js';

export interface FileSymbols {
  hash: string;
  mtime: number;
  symbols: SymbolEntry[];
}

export interface SymbolDatabase {
  version: string;
  lastUpdated: string;
  files: Record<string, FileSymbols>;
}

export class SymbolIndexer {
  private db: SymbolDatabase;

  constructor(initialDb?: SymbolDatabase) {
    this.db = initialDb || { version: '1.0.0', lastUpdated: new Date().toISOString(), files: {} };
  }

  public static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public getDatabase(): SymbolDatabase {
    return this.db;
  }

  public loadCache(cachePath: string): SymbolDatabase {
    if (fs.existsSync(cachePath)) {
      try {
        const raw = fs.readFileSync(cachePath, 'utf8');
        this.db = JSON.parse(raw);
        return this.db;
      } catch { /* use empty db on parse error */ }
    }
    this.db = { version: '1.0.0', lastUpdated: new Date().toISOString(), files: {} };
    return this.db;
  }

  public saveCache(cachePath: string): void {
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(this.db, null, 2), 'utf8');
    } catch { /* ignore non-fatal cache write errors */ }
  }

  public indexFile(filePath: string, content: string, mtime = Date.now()): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const hash = SymbolIndexer.hashContent(content);
    const existing = this.db.files[normPath];
    if (existing && existing.hash === hash) {
      return existing.symbols;
    }

    const symbols = this.extractSymbols(normPath, content);
    this.db.files[normPath] = { hash, mtime, symbols };
    this.db.lastUpdated = new Date().toISOString();
    return symbols;
  }

  private extractSymbols(filePath: string, content: string): SymbolEntry[] {
    const normPath = filePath.replace(/\\/g, '/');
    const ext = path.extname(normPath).toLowerCase();
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      return SymbolParser.parseTypeScript(normPath, content);
    }
    if (ext === '.gd') {
      return SymbolParser.parseGDScript(normPath, content);
    }
    return SymbolParser.parseGeneric(normPath, content);
  }

  public indexFiles(filePaths: string[], baseDir = process.cwd(), cachePath?: string): SymbolDatabase {
    if (cachePath) this.loadCache(cachePath);

    for (const relPath of filePaths) {
      const normRel = relPath.replace(/\\/g, '/');
      const fullPath = path.isAbsolute(normRel) ? normRel : path.join(baseDir, normRel);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const stats = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        this.indexFile(normRel, content, stats.mtimeMs);
      } catch { /* ignore unreadable files */ }
    }

    if (cachePath) this.saveCache(cachePath);
    return this.db;
  }

  public findSymbols(query: string, customDb?: SymbolDatabase): SymbolEntry[] {
    const targetDb = customDb || this.db;
    const lowerQuery = query.toLowerCase().trim();
    const exact: SymbolEntry[] = [];
    const suffix: SymbolEntry[] = [];
    const substr: SymbolEntry[] = [];

    for (const fileData of Object.values(targetDb.files)) {
      for (const s of fileData.symbols) {
        const lowerName = s.name.toLowerCase();
        if (lowerName === lowerQuery) {
          exact.push(s);
        } else if (lowerName.endsWith(`.${lowerQuery}`) || lowerName.endsWith(`::${lowerQuery}`)) {
          suffix.push(s);
        } else if (lowerName.includes(lowerQuery)) {
          substr.push(s);
        }
      }
    }
    const directMatches = [...exact, ...suffix, ...substr];
    if (directMatches.length > 0) return directMatches;

    return this.findFuzzySymbols(lowerQuery, targetDb);
  }

  private findFuzzySymbols(lowerQuery: string, targetDb: SymbolDatabase): SymbolEntry[] {
    const allSymbols: SymbolEntry[] = [];
    for (const fileData of Object.values(targetDb.files)) {
      allSymbols.push(...fileData.symbols);
    }
    const fuzzy = FuzzyMatcher.findMatches(lowerQuery, allSymbols, s => s.name.toLowerCase(), 2);
    return fuzzy.map(f => f.item);
  }
}
