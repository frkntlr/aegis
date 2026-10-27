/**
 * @file curated-ingestion-pipeline.ts
 * Curated ingestion pipeline with URL normalizer, deduplication, and HTTP HEAD health checks.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { DiscoveredSource, NotebookSourceSummary } from './types.js';

export interface CuratedPipelineOptions {
  maxCuratedCount?: number;
  httpHeadChecker?: (url: string) => Promise<boolean>;
  existingSources?: NotebookSourceSummary[];
  existingUrls?: string[];
}

export interface CuratedPipelineResult {
  selectedSources: DiscoveredSource[];
  skippedDuplicates: string[];
  skippedUnhealthy: string[];
}

const STRIPPED_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid'
]);

export class CuratedIngestionPipeline {
  private headChecker?: (url: string) => Promise<boolean>;

  constructor(headChecker?: (url: string) => Promise<boolean>) {
    this.headChecker = headChecker;
  }

  public static normalizeUrl(rawUrl: string): string {
    if (!rawUrl || !rawUrl.trim()) return '';
    try {
      const parsed = new URL(rawUrl.trim());
      parsed.protocol = parsed.protocol.toLowerCase();
      parsed.hostname = parsed.hostname.toLowerCase();

      const searchParams = new URLSearchParams(parsed.search);
      for (const key of Array.from(searchParams.keys())) {
        if (STRIPPED_PARAMS.has(key.toLowerCase())) {
          searchParams.delete(key);
        }
      }
      parsed.search = searchParams.toString();
      let normalized = parsed.toString();
      if (normalized.endsWith('/') && parsed.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return rawUrl.trim();
    }
  }

  private collectExistingUrlSet(options: CuratedPipelineOptions): Set<string> {
    const set = new Set<string>();
    if (options.existingUrls) {
      for (const u of options.existingUrls) {
        set.add(CuratedIngestionPipeline.normalizeUrl(u));
      }
    }
    if (options.existingSources) {
      for (const s of options.existingSources) {
        if (s.title.startsWith('http://') || s.title.startsWith('https://')) {
          set.add(CuratedIngestionPipeline.normalizeUrl(s.title));
        }
      }
    }
    return set;
  }

  private async checkUrlHealth(url: string, customChecker?: (u: string) => Promise<boolean>): Promise<boolean> {
    const checker = customChecker || this.headChecker;
    if (!checker) return true;
    try {
      return await checker(url);
    } catch {
      return false;
    }
  }

  private async processCandidateUrl(
    src: DiscoveredSource,
    existingSet: Set<string>,
    seenInBatch: Set<string>,
    customChecker?: (u: string) => Promise<boolean>
  ): Promise<{ valid: boolean; normalized?: string; reason?: 'duplicate' | 'unhealthy' }> {
    const rawUrl = src.url || '';
    if (!rawUrl) return { valid: false };
    const norm = CuratedIngestionPipeline.normalizeUrl(rawUrl);
    if (existingSet.has(norm) || seenInBatch.has(norm)) {
      return { valid: false, reason: 'duplicate' };
    }
    const isHealthy = await this.checkUrlHealth(norm, customChecker);
    if (!isHealthy) {
      return { valid: false, reason: 'unhealthy' };
    }
    return { valid: true, normalized: norm };
  }

  public async filterAndRank(
    sources: DiscoveredSource[],
    options: CuratedPipelineOptions = {}
  ): Promise<CuratedPipelineResult> {
    const maxK = options.maxCuratedCount ?? 5;
    const existingSet = this.collectExistingUrlSet(options);
    const selectedSources: DiscoveredSource[] = [];
    const skippedDuplicates: string[] = [];
    const skippedUnhealthy: string[] = [];
    const seenInBatch = new Set<string>();

    for (const src of sources) {
      if (selectedSources.length >= maxK) break;
      const res = await this.processCandidateUrl(src, existingSet, seenInBatch, options.httpHeadChecker);
      if (!res.valid) {
        if (res.reason === 'duplicate' && src.url) skippedDuplicates.push(src.url);
        if (res.reason === 'unhealthy' && src.url) skippedUnhealthy.push(src.url);
        continue;
      }
      seenInBatch.add(res.normalized!);
      selectedSources.push({ ...src, url: res.normalized });
    }

    return { selectedSources, skippedDuplicates, skippedUnhealthy };
  }
}
