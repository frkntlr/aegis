/**
 * @file fast-semantic-analyzer.ts
 * Sub-10ms Semantic Codebase Analyzer and Target File Auto-Discovery.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { cleanGitEnv, debugLogIgnored, resolveSafeRepoRoot } from '@aegis/shared';
import { readSemanticManifest, saveSemanticManifest } from './semantic-file-manifest.js';
import {
  ALLOWED_EXTS,
  CODE_EXTS,
  extractSemanticKeywords,
  TEST_INTENT_RE,
  TEST_INTENT_WORDS
} from './semantic-keywords.js';

export interface SemanticAnalysisResult {
  objective: string;
  keywords: string[];
  targetFiles: string[];
  confidence: number;
  durationMs: number;
  fromCache: boolean;
}

interface CandidateMeta {
  lowerPath: string; basename: string; ext: string;
  isCode: boolean; isTest: boolean; isPkgSrc: boolean;
}

function scoreKeywordMatch(meta: CandidateMeta, kw: string): number {
  if (meta.basename === `${kw}${meta.ext}` || meta.basename.startsWith(`${kw}.`)) return 25;
  if (meta.basename.includes(kw)) return 15;
  if (meta.lowerPath.includes(`/${kw}/`) || meta.lowerPath.includes(kw)) return 8;
  return 0;
}

function scoreCodeBonus(meta: CandidateMeta, currentScore: number): number {
  if (!meta.isCode || currentScore <= 0) return 0;
  if (meta.isPkgSrc) return 27;
  if (!meta.isTest && (meta.lowerPath.includes('src/') || meta.lowerPath.includes('packages/'))) return 20;
  return 12;
}

export class FastSemanticAnalyzer {
  private repoRoot: string;
  private cachedFiles: { files: string[]; timestamp: number } | null = null;
  private lastLookupFromCache = false;
  private keywordCache = new Map<string, string[]>();
  private metaCache = new Map<string, CandidateMeta>();
  private testIntentCache = new Map<string, boolean>();
  private static readonly FILE_CACHE_TTL_MS = 10000;

  constructor(repoRoot?: string) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
  }

  public extractKeywords(text: string): string[] {
    const cached = this.keywordCache.get(text);
    if (cached) return [...cached];
    const keywords = extractSemanticKeywords(text);
    if (this.keywordCache.size >= 500) this.keywordCache.clear();
    this.keywordCache.set(text, keywords);
    return keywords;
  }

  public listCandidateFiles(): string[] {
    const now = Date.now();
    this.lastLookupFromCache = false;
    if (this.cachedFiles && now >= this.cachedFiles.timestamp && (now - this.cachedFiles.timestamp) < FastSemanticAnalyzer.FILE_CACHE_TTL_MS) {
      this.lastLookupFromCache = true;
      return this.cachedFiles.files;
    }

    const index = this.resolveGitIndexPath();
    const diskFiles = readSemanticManifest(this.repoRoot, index, FastSemanticAnalyzer.FILE_CACHE_TTL_MS, now);
    if (diskFiles) {
      this.lastLookupFromCache = true;
      this.cachedFiles = diskFiles;
      return diskFiles.files;
    }

    let files: string[] = [];
    if (fs.existsSync(path.join(this.repoRoot, '.git'))) {
      try {
        const gitOut = execSync('git ls-files -co --exclude-standard', { cwd: this.repoRoot, encoding: 'utf8', timeout: 3000, env: cleanGitEnv() });
        files = gitOut.split('\n').map(f => f.trim().replace(/\\/g, '/')).filter(f => {
          if (!f) return false;
          const ext = path.extname(f).toLowerCase();
          return ALLOWED_EXTS.has(ext);
        });
      } catch {
        files = this.walkDirectoryFallback(this.repoRoot, '');
      }
    } else {
      files = this.walkDirectoryFallback(this.repoRoot, '');
    }

    saveSemanticManifest(this.repoRoot, index, { files, timestamp: now });
    this.cachedFiles = { files, timestamp: now };
    return files;
  }

  private resolveGitIndexPath(): string | null {
    const dotGit = path.resolve(this.repoRoot, '.git');
    if (!fs.existsSync(dotGit)) return null;
    try {
      const stat = fs.statSync(dotGit);
      if (stat.isDirectory()) {
        const idx = path.join(dotGit, 'index');
        return fs.existsSync(idx) ? idx : null;
      }
      if (stat.isFile()) {
        const match = fs.readFileSync(dotGit, 'utf8').trim().match(/^gitdir:\s*(.+)$/m);
        if (match) {
          const rawDir = match[1].trim();
          const gitDir = path.isAbsolute(rawDir) ? rawDir : path.resolve(this.repoRoot, rawDir);
          const idx = path.join(gitDir, 'index');
          return fs.existsSync(idx) ? idx : null;
        }
      }
    } catch (err: unknown) { debugLogIgnored('FastSemanticAnalyzer:resolveGitIndex', err); }
    return null;
  }

  private walkDirectoryFallback(baseDir: string, currentRel: string): string[] {
    const dirPath = currentRel ? path.join(baseDir, currentRel) : baseDir;
    const accumulator: string[] = [];
    if (!fs.existsSync(dirPath)) return accumulator;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
          continue;
        }
        const rel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          accumulator.push(...this.walkDirectoryFallback(baseDir, rel));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ALLOWED_EXTS.has(ext)) accumulator.push(rel.replace(/\\/g, '/'));
        }
      }
    } catch (err: unknown) { debugLogIgnored('FastSemanticAnalyzer:walkDir', err); }
    return accumulator;
  }

  private getCandidateMeta(filePath: string): CandidateMeta {
    let meta = this.metaCache.get(filePath);
    if (!meta) {
      const lower = filePath.toLowerCase().replace(/\\/g, '/');
      const lastSlash = lower.lastIndexOf('/');
      const basename = lastSlash === -1 ? lower : lower.slice(lastSlash + 1);
      const dotIdx = basename.lastIndexOf('.');
      const ext = dotIdx === -1 ? '' : basename.slice(dotIdx);
      const isTest = basename.includes('.test.') || basename.includes('.spec.') ||
                     lower.includes('__tests__') || basename.endsWith('.test') ||
                     basename.endsWith('.spec');
      const isPkgSrc = !isTest && ((lower.includes('packages/') && lower.includes('/src/')) || lower.startsWith('src/'));
      const isCode = CODE_EXTS.has(ext);
      meta = { lowerPath: lower, basename, ext, isCode, isTest, isPkgSrc };
      if (this.metaCache.size < 10000) this.metaCache.set(filePath, meta);
    }
    return meta;
  }

  public hasTestIntent(objective: string, keywords?: string[]): boolean {
    const cached = this.testIntentCache.get(objective);
    if (cached !== undefined) return cached;
    const lower = objective.toLowerCase();
    let hasIntent = TEST_INTENT_RE.test(lower);
    if (!hasIntent && keywords) {
      hasIntent = keywords.some(k => TEST_INTENT_WORDS.has(k));
    }
    if (this.testIntentCache.size >= 500) this.testIntentCache.clear();
    this.testIntentCache.set(objective, hasIntent);
    return hasIntent;
  }

  public scoreCandidate(filePath: string, keywords: string[], hasTestIntent?: boolean): number {
    const meta = this.getCandidateMeta(filePath);
    let score = 0;
    for (const kw of keywords) {
      score += scoreKeywordMatch(meta, kw);
    }
    score += scoreCodeBonus(meta, score);
    const testIntent = hasTestIntent ?? keywords.some(k => TEST_INTENT_WORDS.has(k));
    if (meta.isTest && !testIntent) score -= 15;
    return score;
  }

  public analyze(objective: string, explicitFiles: string[] = [], maxResults = 5): SemanticAnalysisResult {
    const start = Date.now();
    const keywords = this.extractKeywords(objective);
    const hasIntent = this.hasTestIntent(objective, keywords);
    const candidates = this.listCandidateFiles();
    const fromCache = this.lastLookupFromCache;

    const scored: Array<{ file: string; score: number }> = [];
    for (const file of candidates) {
      const score = this.scoreCandidate(file, keywords, hasIntent);
      if (score > 0) scored.push({ file, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const selected = new Set<string>(explicitFiles.map(f => f.replace(/\\/g, '/')));

    for (const item of scored) {
      if (selected.size >= maxResults) break;
      try {
        if (fs.statSync(path.resolve(this.repoRoot, item.file)).isFile()) selected.add(item.file);
      } catch (err: unknown) { debugLogIgnored('FastSemanticAnalyzer:statCandidate', err); }
    }

    const targetFiles = Array.from(selected);
    const topScore = scored.length > 0 ? scored[0].score : 0;
    const confidence = targetFiles.length === 0 ? 0 : Math.min(1.0, Math.round((topScore / 30) * 100) / 100);
    const durationMs = Date.now() - start;

    return { objective, keywords, targetFiles, confidence, durationMs, fromCache };
  }
}
