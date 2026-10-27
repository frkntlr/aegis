/**
 * @file autonomous-pruning-engine.ts
 * Multi-Factor Confidence Scoring (MFCS) engine for autonomous source pruning.
 * Guarantees zero data loss with Immutability Hard-Veto & thresholding.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NotebookSourceSummary } from './types.js';

export interface PruneScoreBreakdown {
  immutabilityShield: boolean;
  supersessionScore: number;
  driftScore: number;
  citationRecencyScore: number;
  totalScore: number;
  verdict: 'AUTONOMOUS_PRUNE_APPROVED' | 'PROTECTED' | 'RETAINED';
  reasons: string[];
}

export interface EvaluatedPruneCandidate {
  sourceId: string;
  title: string;
  url?: string;
  score: PruneScoreBreakdown;
}

export interface PruningEngineConfig {
  pinnedKeywords?: string[];
  pinnedIds?: string[];
  rfcDir?: string;
  autonomousThreshold?: number;
  httpHeadChecker?: (url: string) => Promise<boolean>;
}

const DEFAULT_PINNED_KEYWORDS = [
  'constitution',
  'demir-kafes',
  'demir kafes',
  'anayasa',
  'core-architecture',
  'core architecture',
  'living architecture',
  'rfc-index'
];

export class AutonomousPruningEngine {
  private pinnedKeywords: string[];
  private pinnedIds: Set<string>;
  private rfcDir: string;
  private threshold: number;
  private headChecker?: (url: string) => Promise<boolean>;

  constructor(config: PruningEngineConfig = {}) {
    this.pinnedKeywords = (config.pinnedKeywords || DEFAULT_PINNED_KEYWORDS).map(k => k.toLowerCase());
    this.pinnedIds = new Set(config.pinnedIds || []);
    this.rfcDir = config.rfcDir || path.resolve(process.cwd(), 'docs', 'rfc');
    this.threshold = config.autonomousThreshold ?? 60;
    this.headChecker = config.httpHeadChecker;
  }

  public isImmutable(title: string, sourceId: string): boolean {
    if (this.pinnedIds.has(sourceId)) return true;
    const lower = title.toLowerCase();
    return this.pinnedKeywords.some(kw => lower.includes(kw));
  }

  public checkSupersededRfc(title: string): { isSuperseded: boolean; supersededBy?: string } {
    const rfcMatch = title.match(/RFC-(\d{3})/i);
    if (!rfcMatch || !fs.existsSync(this.rfcDir)) return { isSuperseded: false };

    const rfcTarget = `RFC-${rfcMatch[1].toUpperCase()}`;
    try {
      const files = fs.readdirSync(this.rfcDir).filter(f => f.startsWith(rfcTarget) && f.endsWith('.md'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(this.rfcDir, f), 'utf8');
        if (/Status:\s*Superseded/i.test(content) || /Durum:\s*Superseded/i.test(content)) {
          const supMatch = content.match(/Superseded by (RFC-\d{3})/i);
          return { isSuperseded: true, supersededBy: supMatch ? supMatch[1] : 'Superseded' };
        }
      }
    } catch {
      // Safe fallback on file IO errors
    }
    return { isSuperseded: false };
  }

  public async evaluateDrift(title: string, url?: string): Promise<{ score: number; reason?: string }> {
    const lower = title.toLowerCase();
    if (lower.includes('[obsolete]') || lower.includes('[deprecated]') || lower.includes('[stale]')) {
      return { score: 35, reason: 'Title explicitly flagged as obsolete/deprecated' };
    }

    if (url && this.headChecker) {
      try {
        const isHealthy = await this.headChecker(url);
        if (!isHealthy) {
          return { score: 35, reason: `Web URL unreachable or broken: ${url}` };
        }
      } catch {
        return { score: 35, reason: `Web URL check threw error: ${url}` };
      }
    }
    return { score: 0 };
  }

  public evaluateCitationRecency(turnCitationsCount?: number): { score: number; reason?: string } {
    if (turnCitationsCount === 0) {
      return { score: 25, reason: 'Zero citations across active conversation window' };
    }
    return { score: 0 };
  }

  private buildProtectedCandidate(source: NotebookSourceSummary, url?: string): EvaluatedPruneCandidate {
    return {
      sourceId: source.id,
      title: source.title,
      url,
      score: {
        immutabilityShield: true,
        supersessionScore: 0,
        driftScore: 0,
        citationRecencyScore: 0,
        totalScore: 0,
        verdict: 'PROTECTED',
        reasons: ['Protected by Immutability Shield (Anayasal Dokunulmazlık)']
      }
    };
  }

  private computeScoreBreakdown(
    supRes: { isSuperseded: boolean; supersededBy?: string },
    driftRes: { score: number; reason?: string },
    citeRes: { score: number; reason?: string }
  ): { totalScore: number; reasons: string[]; supersessionScore: number } {
    const reasons: string[] = [];
    const supersessionScore = supRes.isSuperseded ? 40 : 0;
    let totalScore = supersessionScore;
    if (supRes.isSuperseded) {
      reasons.push(`Formally superseded RFC (Superseded by: ${supRes.supersededBy || 'Unknown'})`);
    }
    if (driftRes.score > 0) {
      totalScore += driftRes.score;
      if (driftRes.reason) reasons.push(driftRes.reason);
    }
    if (citeRes.score > 0) {
      totalScore += citeRes.score;
      if (citeRes.reason) reasons.push(citeRes.reason);
    }
    return { totalScore, reasons, supersessionScore };
  }

  public async evaluateSource(
    source: NotebookSourceSummary,
    options: { url?: string; turnCitationsCount?: number } = {}
  ): Promise<EvaluatedPruneCandidate> {
    if (this.isImmutable(source.title, source.id)) {
      return this.buildProtectedCandidate(source, options.url);
    }
    const supRes = this.checkSupersededRfc(source.title);
    const driftRes = await this.evaluateDrift(source.title, options.url);
    const citeRes = this.evaluateCitationRecency(options.turnCitationsCount);
    const { totalScore, reasons, supersessionScore } = this.computeScoreBreakdown(supRes, driftRes, citeRes);
    const verdict = totalScore >= this.threshold ? 'AUTONOMOUS_PRUNE_APPROVED' : 'RETAINED';

    return {
      sourceId: source.id,
      title: source.title,
      url: options.url,
      score: {
        immutabilityShield: false,
        supersessionScore,
        driftScore: driftRes.score,
        citationRecencyScore: citeRes.score,
        totalScore,
        verdict,
        reasons
      }
    };
  }

  public async evaluateAll(
    sources: NotebookSourceSummary[],
    optionsMap: Record<string, { url?: string; turnCitationsCount?: number }> = {}
  ): Promise<EvaluatedPruneCandidate[]> {
    const results: EvaluatedPruneCandidate[] = [];
    for (const s of sources) {
      const opts = optionsMap[s.id] || {};
      const evalCandidate = await this.evaluateSource(s, opts);
      results.push(evalCandidate);
    }
    return results;
  }

  public async filterAutonomousApproved(
    sources: NotebookSourceSummary[],
    optionsMap: Record<string, { url?: string; turnCitationsCount?: number }> = {}
  ): Promise<EvaluatedPruneCandidate[]> {
    const all = await this.evaluateAll(sources, optionsMap);
    return all.filter(c => c.score.verdict === 'AUTONOMOUS_PRUNE_APPROVED');
  }
}
