/**
 * @file fast-semantic-analyzer.ts
 * Sub-10ms Semantic Codebase Analyzer and Target File Auto-Discovery.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { cleanGitEnv, resolveSafeRepoRoot } from '@aegis/shared';

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

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'this', 'that', 'from', 'into', 'over', 'after',
  'bir', 've', 'ile', 'icin', 'olan', 'gibi', 'daha', 'tam', 'bunu', 'buna',
  'make', 'build', 'create', 'update', 'fix', 'refactor', 'test', 'check'
]);

const TEST_INTENT_WORDS = new Set(['test', 'spec', 'audit', 'triage', 'qa']);
const TEST_INTENT_RE = /\b(test|spec|audit|triage|qa)\b/i;
const CODE_EXTS = new Set(['.ts', '.tsx', '.gd', '.py', '.rs', '.go', '.cs', '.cpp']);
const ALLOWED_EXTS = new Set(['.ts', '.tsx', '.gd', '.py', '.rs', '.go', '.cpp', '.cs', '.tscn', '.tres', '.json', '.md']);
const CAMEL_SPLIT_RE = /([a-z])([A-Z])/g;
const CLEAN_TOKEN_RE = /[^\p{L}\p{N}\s_-]/gu;

const TURKISH_SYNONYMS: Record<string, string[]> = {
  'sağlık': ['health', 'hp'], 'saglik': ['health', 'hp'], 'oyuncu': ['player'], 'karakter': ['player', 'character'],
  'dövüş': ['combat', 'battle', 'fight'], 'dovus': ['combat', 'battle', 'fight'], 'savaş': ['combat', 'battle'], 'savas': ['combat', 'battle'],
  'envanter': ['inventory'], 'arayüz': ['ui', 'hud', 'interface', 'menu'], 'arayuz': ['ui', 'hud', 'interface', 'menu'], 'tema': ['theme'],
  'denetim': ['audit', 'triage', 'test'], 'görev': ['task', 'mission', 'quest'], 'gorev': ['task', 'mission', 'quest'],
  'ayarlar': ['settings', 'config'], 'ayar': ['setting', 'config'], 'ses': ['audio', 'sound'], 'kamera': ['camera'],
  'düşman': ['enemy'], 'dusman': ['enemy'], 'harita': ['map', 'tilemap'], 'yönetici': ['manager', 'controller'], 'yonetici': ['manager', 'controller'],
  'silah': ['weapon'], 'doküman': ['doc', 'wiki'], 'dokuman': ['doc', 'wiki'], 'dokümantasyon': ['doc', 'docs', 'wiki'], 'dokumantasyon': ['doc', 'docs', 'wiki'],
  'hafıza': ['memory', 'cache'], 'bellek': ['memory', 'cache'], 'çoklu': ['multi', 'teamwork', 'parallel'], 'coklu': ['multi', 'teamwork', 'parallel'],
  'ajan': ['agent', 'subagent', 'teamwork'], 'dağıt': ['shard', 'dispatch', 'distribute'], 'dagit': ['shard', 'dispatch', 'distribute'],
  'böl': ['decompose', 'shard', 'split'], 'bol': ['decompose', 'shard', 'split'], 'performans': ['performance', 'speed', 'optimization']
};

export class FastSemanticAnalyzer {
  private repoRoot: string;
  private cachedFiles: { files: string[]; timestamp: number } | null = null;
  private keywordCache = new Map<string, string[]>();
  private metaCache = new Map<string, CandidateMeta>();
  private testIntentCache = new Map<string, boolean>();
  private static readonly FILE_CACHE_TTL_MS = 10000;

  constructor(repoRoot?: string) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
  }

  private appendKeyword(kw: string, target: string[]): void {
    if (kw.length < 3 || STOP_WORDS.has(kw) || target.includes(kw)) return;
    target.push(kw);
    const syns = TURKISH_SYNONYMS[kw];
    if (!syns) return;
    for (const s of syns) {
      if (!target.includes(s)) target.push(s);
    }
  }

  public extractKeywords(text: string): string[] {
    const cached = this.keywordCache.get(text);
    if (cached) return [...cached];

    const rawTokens = text.replace(CLEAN_TOKEN_RE, ' ').split(/\s+/);
    const keywords: string[] = [];

    for (const token of rawTokens) {
      if (!token || token.length < 3) continue;
      const subTokens = token.replace(CAMEL_SPLIT_RE, '$1 $2').replace(/[_-]/g, ' ').toLowerCase().split(' ');
      for (const st of subTokens) {
        this.appendKeyword(st.trim(), keywords);
      }
    }
    if (this.keywordCache.size >= 500) this.keywordCache.clear();
    this.keywordCache.set(text, keywords);
    return keywords;
  }

  public listCandidateFiles(): string[] {
    const now = Date.now();
    if (this.cachedFiles && (now - this.cachedFiles.timestamp) < FastSemanticAnalyzer.FILE_CACHE_TTL_MS) {
      return this.cachedFiles.files;
    }

    const diskFiles = this.readDiskManifest();
    if (diskFiles) {
      this.cachedFiles = { files: diskFiles, timestamp: now };
      return diskFiles;
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

    this.saveDiskManifest(files);
    this.cachedFiles = { files, timestamp: now };
    return files;
  }

  private getManifestPath(): string {
    return path.resolve(this.repoRoot, '.aegis', 'cache', 'fast-semantic-manifest.json');
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
    } catch { /* ignore */ }
    return null;
  }

  private readDiskManifest(): string[] | null {
    const gitIndexPath = this.resolveGitIndexPath();
    const manifestPath = this.getManifestPath();
    if (!gitIndexPath || !fs.existsSync(manifestPath)) return null;
    try {
      const gitMtime = fs.statSync(gitIndexPath).mtimeMs;
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { gitIndexMtime?: number; files?: string[] };
      if (data.gitIndexMtime === gitMtime && Array.isArray(data.files)) return data.files;
    } catch { /* ignore corrupted disk cache */ }
    return null;
  }

  private saveDiskManifest(files: string[]): void {
    const gitIndexPath = this.resolveGitIndexPath();
    if (!gitIndexPath) return;
    try {
      const gitMtime = fs.statSync(gitIndexPath).mtimeMs;
      const manifestPath = this.getManifestPath();
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify({ gitIndexMtime: gitMtime, files }), 'utf8');
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
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
    let score = 0;
    const meta = this.getCandidateMeta(filePath);
    const { lowerPath, basename, ext, isCode, isTest, isPkgSrc } = meta;

    for (const kw of keywords) {
      if (basename === `${kw}${ext}` || basename.startsWith(`${kw}.`)) {
        score += 25;
      } else if (basename.includes(kw)) {
        score += 15;
      } else if (lowerPath.includes(`/${kw}/`) || lowerPath.includes(kw)) {
        score += 8;
      }
    }

    if (isCode && score > 0) {
      score += 12;
      if (isPkgSrc) {
        score += 15;
      } else if (!isTest && (lowerPath.includes('src/') || lowerPath.includes('packages/'))) {
        score += 8;
      }
    }

    const testIntent = hasTestIntent ?? keywords.some(k => TEST_INTENT_WORDS.has(k));
    if (isTest && !testIntent) {
      score -= 15;
    }

    return score;
  }

  public analyze(objective: string, explicitFiles: string[] = [], maxResults = 5): SemanticAnalysisResult {
    const start = Date.now();
    const fromCache = this.cachedFiles !== null;
    const keywords = this.extractKeywords(objective);
    const hasIntent = this.hasTestIntent(objective, keywords);
    const candidates = this.listCandidateFiles();

    const scored: Array<{ file: string; score: number }> = [];
    for (const file of candidates) {
      const score = this.scoreCandidate(file, keywords, hasIntent);
      if (score > 0) scored.push({ file, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const selected = new Set<string>(explicitFiles.map(f => f.replace(/\\/g, '/')));

    for (const item of scored) {
      if (selected.size >= maxResults) break;
      selected.add(item.file);
    }

    const targetFiles = Array.from(selected);
    const topScore = scored.length > 0 ? scored[0].score : 0;
    const confidence = targetFiles.length === 0 ? 0 : Math.min(1.0, Math.round((topScore / 30) * 100) / 100);
    const durationMs = Date.now() - start;

    return { objective, keywords, targetFiles, confidence, durationMs, fromCache };
  }
}
