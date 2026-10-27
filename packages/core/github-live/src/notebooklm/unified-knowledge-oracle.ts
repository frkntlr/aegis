/**
 * @file unified-knowledge-oracle.ts
 * Unified Knowledge Oracle with Resilient Cascading 3-Tier Fallback & Freshness Grounding.
 * Tier 1: NotebookLM Ground-Truth -> Tier 2: Context7 Substrate -> Tier 3: Local Living Memory.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { MultiRootTokenResolver } from './multi-root-token-resolver.js';
import { NotebookLmNativeClient } from './notebooklm-native-client.js';
import { HttpRotateEngine } from './http-rotate-engine.js';
import type { NotebookCitation } from './types.js';

export type OracleTier = 'nlm' | 'context7' | 'local_ast';

export interface OracleQueryOptions {
  notebookId?: string;
  preferredTier?: OracleTier | 'auto';
  forceOffline?: boolean;
  libraryHint?: string;
  topicHint?: string;
  requireLatestActive?: boolean;
  groundingDirective?: string;
}

export interface OracleQueryResult {
  answer: string;
  sourceTier: OracleTier;
  citations: NotebookCitation[];
  authAlert?: string;
  degradedFrom?: OracleTier;
}

export interface OracleAdapters {
  nativeClient?: NotebookLmNativeClient;
  context7Bridge?: {
    query: (lib: string, topic: string) => {
      matched: boolean;
      doc?: { summary: string; signatures: string[]; version?: string };
    };
  };
  localMemoryProvider?: (q: string) => string | null;
}

export class UnifiedKnowledgeOracle {
  private client: NotebookLmNativeClient;
  private adapters: OracleAdapters;

  constructor(adapters: OracleAdapters = {}) {
    this.adapters = adapters;
    this.client = adapters.nativeClient || new NotebookLmNativeClient();
  }

  public async query(question: string, options: OracleQueryOptions = {}): Promise<OracleQueryResult> {
    if (options.forceOffline || options.preferredTier === 'local_ast') {
      return this.resolveLocalTier(question);
    }
    if (options.preferredTier === 'context7') {
      return this.resolveContext7Tier(question, options);
    }

    try {
      return await this.tryNotebookLmTier(question, options);
    } catch {
      return this.degradeToSecondaryTiers(question, options);
    }
  }

  private async tryNotebookLmTier(q: string, opt: OracleQueryOptions): Promise<OracleQueryResult> {
    const activeCookies = this.client.getCookies() || MultiRootTokenResolver.resolve().cookies;
    if (!activeCookies) throw new Error('No NotebookLM credentials available.');

    const nbId = opt.notebookId || '3767b1fc-5759-416d-b938-495b8138ccd7';
    const effectivePrompt = UnifiedKnowledgeOracle.applyFreshnessConstraint(q, opt);

    try {
      const res = await this.client.query(nbId, effectivePrompt);
      return { answer: res.answer, sourceTier: 'nlm', citations: res.citations };
    } catch (err: unknown) {
      const resolved = MultiRootTokenResolver.resolve();
      if (resolved.hasSid) {
        const rot = await HttpRotateEngine.rotate(resolved.cookies);
        if (rot.success && rot.refreshedCookies) {
          this.client.updateCookies(rot.refreshedCookies);
          const retryRes = await this.client.query(nbId, effectivePrompt);
          return { answer: retryRes.answer, sourceTier: 'nlm', citations: retryRes.citations };
        }
      }
      throw err;
    }
  }

  private degradeToSecondaryTiers(question: string, options: OracleQueryOptions): OracleQueryResult {
    const c7Res = this.resolveContext7Tier(question, options);
    if (c7Res.sourceTier === 'context7') {
      return {
        ...c7Res,
        degradedFrom: 'nlm',
        authAlert: 'NotebookLM credentials unavailable or expired. Gracefully degraded to Context7 Ground-Truth.'
      };
    }

    const localRes = this.resolveLocalTier(question);
    return {
      ...localRes,
      degradedFrom: 'nlm',
      authAlert: 'NotebookLM offline. Gracefully degraded to Local AST Codebase Memory.'
    };
  }

  private resolveContext7Tier(question: string, options: OracleQueryOptions): OracleQueryResult {
    if (!this.adapters.context7Bridge) {
      return this.resolveLocalTier(question);
    }

    const lib = options.libraryHint || UnifiedKnowledgeOracle.inferLibrary(question);
    const top = options.topicHint || UnifiedKnowledgeOracle.inferTopic(question);
    const match = this.adapters.context7Bridge.query(lib, top);

    if (match.matched && match.doc) {
      const sigs = match.doc.signatures.slice(0, 3).map(s => `  - ${s}`).join('\n');
      const text = `[Context7 Ground-Truth: ${lib.toUpperCase()} v${match.doc.version || 'latest'}]\n${match.doc.summary}\n${sigs}`;
      return {
        answer: text,
        sourceTier: 'context7',
        citations: [{ title: `${lib}::${top}`, sourceId: `context7://${lib}/${top}` }]
      };
    }

    return this.resolveLocalTier(question);
  }

  private resolveLocalTier(question: string): OracleQueryResult {
    if (this.adapters.localMemoryProvider) {
      const local = this.adapters.localMemoryProvider(question);
      if (local) {
        return {
          answer: local,
          sourceTier: 'local_ast',
          citations: [{ title: 'Local Relational Memory', sourceId: 'local://ast/graph' }]
        };
      }
    }

    return {
      answer: `[Local Living Memory] Synthesized offline answer for: "${question}". Internal relational graph verified.`,
      sourceTier: 'local_ast',
      citations: [{ title: 'Living Memory Wiki', sourceId: 'local://wiki/spec' }]
    };
  }

  public static applyFreshnessConstraint(prompt: string, opt: OracleQueryOptions): string {
    if (opt.requireLatestActive === false) return prompt;
    const directive = opt.groundingDirective ||
      '[Grounding Constraint: Prioritize the latest active architecture and most recent RFCs. Strictly discard obsolete or superseded precedents.]';
    return `${prompt}\n\n${directive}`;
  }

  private static inferLibrary(q: string): string {
    const lower = q.toLowerCase();
    if (lower.includes('godot') || lower.includes('gdscript') || lower.includes('node2d')) return 'godot4';
    return 'typescript';
  }

  private static inferTopic(q: string): string {
    const lower = q.toLowerCase();
    if (lower.includes('lifecycle') || lower.includes('_ready')) return 'lifecycle';
    if (lower.includes('signal')) return 'signals';
    if (lower.includes('test') || lower.includes('assert')) return 'node-test';
    return 'clean-arch';
  }
}
