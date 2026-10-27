/**
 * @file source-freshness.ts
 * Source Freshness Auditor and Safe Tombstone Pruner with Pinned Whitelist.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorktreeMutexShield } from '@aegis/shared';
import { NotebookLmNativeClient } from './notebooklm-native-client.js';
import type { NotebookSourceSummary } from './types.js';

export interface PinnedSourceConfig {
  pinnedTitles?: string[];
  pinnedIds?: string[];
}

export interface SourceAuditResult {
  sourceId: string;
  title: string;
  isPinned: boolean;
  isStale: boolean;
  reason: 'pinned' | 'superseded' | 'obsolete' | 'active';
  supersededBy?: string;
}

export interface PruneOptions {
  dryRun?: boolean;
  force?: boolean;
  rfcDir?: string;
  notebookId?: string;
}

export interface PruneResult {
  totalScanned: number;
  candidates: SourceAuditResult[];
  pruned: string[];
  dryRun: boolean;
  lockWarning?: string;
}

const DEFAULT_PINNED_KEYWORDS = ['constitution', 'demir-kafes', 'core-architecture', 'anayasa', 'living architecture'];

export class SourceFreshnessAuditor {
  private pinnedTitles: string[];
  private pinnedIds: Set<string>;

  constructor(config: PinnedSourceConfig = {}) {
    this.pinnedTitles = (config.pinnedTitles || DEFAULT_PINNED_KEYWORDS).map(t => t.toLowerCase());
    this.pinnedIds = new Set(config.pinnedIds || []);
  }

  public auditSources(sources: NotebookSourceSummary[], rfcDir?: string): SourceAuditResult[] {
    const resolvedRfcDir = rfcDir || path.resolve(process.cwd(), 'docs', 'rfc');
    const supersededMap = SourceFreshnessAuditor.scanSupersededRfcs(resolvedRfcDir);

    return sources.map(source => this.auditSingleSource(source, supersededMap));
  }

  private auditSingleSource(source: NotebookSourceSummary, supersededMap: Map<string, string>): SourceAuditResult {
    const lowerTitle = source.title.toLowerCase();

    if (this.pinnedIds.has(source.id) || this.pinnedTitles.some(k => lowerTitle.includes(k))) {
      return { sourceId: source.id, title: source.title, isPinned: true, isStale: false, reason: 'pinned' };
    }

    if (lowerTitle.includes('[superseded]') || lowerTitle.includes('[obsolete]') || lowerTitle.includes('[deprecated]')) {
      return { sourceId: source.id, title: source.title, isPinned: false, isStale: true, reason: 'obsolete' };
    }

    const rfcMatch = source.title.match(/RFC-(\d{3})/i);
    if (rfcMatch) {
      const rfcKey = `RFC-${rfcMatch[1].toUpperCase()}`;
      if (supersededMap.has(rfcKey)) {
        const supersededBy = supersededMap.get(rfcKey);
        return { sourceId: source.id, title: source.title, isPinned: false, isStale: true, reason: 'superseded', supersededBy };
      }
    }

    return { sourceId: source.id, title: source.title, isPinned: false, isStale: false, reason: 'active' };
  }

  public static scanSupersededRfcs(rfcDir: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!fs.existsSync(rfcDir)) return map;

    try {
      const files = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
      for (const file of files) {
        const fullPath = path.join(rfcDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const rfcNumMatch = file.match(/RFC-(\d{3})/i);
        if (!rfcNumMatch) continue;
        const currentRfc = `RFC-${rfcNumMatch[1].toUpperCase()}`;

        if (/Durum:\s*Superseded/i.test(content) || /Status:\s*Superseded/i.test(content)) {
          const supByMatch = content.match(/Superseded by (RFC-\d{3})/i);
          map.set(currentRfc, supByMatch ? supByMatch[1] : 'Superseded');
        }
      }
    } catch {
      // Safe fallback on file IO errors
    }
    return map;
  }
}

export class SourceTombstonePruner {
  private client: NotebookLmNativeClient;
  private auditor: SourceFreshnessAuditor;

  constructor(client?: NotebookLmNativeClient, auditor?: SourceFreshnessAuditor) {
    this.client = client || new NotebookLmNativeClient();
    this.auditor = auditor || new SourceFreshnessAuditor();
  }

  public async prune(notebookId: string, options: PruneOptions = {}): Promise<PruneResult> {
    const lock = WorktreeMutexShield.inspectLock('.aegis/locks/notebooklm.lock');
    const lockWarning = lock?.warning;

    const sources = await this.client.listSources(notebookId);
    const audited = this.auditor.auditSources(sources, options.rfcDir);
    const candidates = audited.filter(a => a.isStale && !a.isPinned);

    const isDryRun = options.force !== true;
    const pruned: string[] = [];

    if (!isDryRun) {
      for (const candidate of candidates) {
        try {
          await this.client.deleteSource(candidate.sourceId);
          pruned.push(candidate.sourceId);
        } catch {
          // Log or tolerate transient delete errors
        }
      }
    }

    return {
      totalScanned: sources.length,
      candidates,
      pruned,
      dryRun: isDryRun,
      lockWarning
    };
  }
}
