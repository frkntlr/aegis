/**
 * @file deep-research-workflow.ts
 * Quota-guarded deep research workflow with curated deduplication and transactional pruning swap.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { NotebookLmNativeClient } from './notebooklm-native-client.js';
import { CuratedIngestionPipeline } from './curated-ingestion-pipeline.js';
import { AutonomousPruningEngine } from './autonomous-pruning-engine.js';
import { TombstoneVaultManager } from './tombstone-vault-manager.js';
import type { ResearchPollResult, DiscoveredSource, NotebookSourceSummary } from './types.js';

export type IngestMode = 'digest' | 'curated' | 'none';

export interface DeepWorkflowOptions {
  ingestMode?: IngestMode;
  detach?: boolean;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  maxCuratedSources?: number;
  sleeper?: (ms: number) => Promise<void>;
  httpHeadChecker?: (url: string) => Promise<boolean>;
}

export interface DeepWorkflowResult {
  taskId: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
  synthesis: string;
  sources: DiscoveredSource[];
  ingestedSourceId?: string;
  curatedImportCount?: number;
  prunedCount?: number;
  quotaWarning?: boolean;
  sourceCount?: number;
}

const MAX_SAFE_SOURCE_COUNT = 45;

export class NotebookLmDeepResearchWorkflow {
  private client: NotebookLmNativeClient;
  private pipeline: CuratedIngestionPipeline;
  private pruningEngine: AutonomousPruningEngine;
  private vaultManager: TombstoneVaultManager;

  constructor(
    client?: NotebookLmNativeClient,
    pipeline?: CuratedIngestionPipeline,
    pruningEngine?: AutonomousPruningEngine,
    vaultManager?: TombstoneVaultManager
  ) {
    this.client = client || new NotebookLmNativeClient();
    this.pipeline = pipeline || new CuratedIngestionPipeline();
    this.pruningEngine = pruningEngine || new AutonomousPruningEngine();
    this.vaultManager = vaultManager || new TombstoneVaultManager();
  }

  public async start(notebookId: string, topic: string): Promise<{ taskId: string }> {
    const res = await this.client.startResearch(notebookId, topic, 'web', 'deep');
    if (!res.task_id) {
      throw new Error(`Failed to initiate deep research on topic: "${topic}".`);
    }
    return { taskId: res.task_id };
  }

  public async poll(notebookId: string, taskId: string): Promise<ResearchPollResult> {
    return this.client.pollResearch(notebookId, taskId);
  }

  private async processIngestion(
    notebookId: string,
    topic: string,
    taskId: string,
    pollRes: ResearchPollResult,
    existingSources: NotebookSourceSummary[],
    options: DeepWorkflowOptions
  ): Promise<{ ingestedSourceId?: string; curatedImportCount: number; prunedCount: number }> {
    const ingestMode = options.ingestMode ?? 'curated';
    if (ingestMode === 'digest' && pollRes.synthesis) {
      const digestDoc = NotebookLmDeepResearchWorkflow.formatDigest(topic, pollRes);
      const addRes = await this.client.addTextSource(notebookId, `Research Digest: ${topic}`, digestDoc);
      return { ingestedSourceId: addRes.sourceId, curatedImportCount: 0, prunedCount: 0 };
    }
    if (ingestMode === 'curated' && pollRes.sources.length > 0) {
      const outcome = await this.handleCuratedIngest(notebookId, taskId, pollRes.sources, existingSources, options);
      return { curatedImportCount: outcome.importedCount, prunedCount: outcome.prunedCount };
    }
    return { curatedImportCount: 0, prunedCount: 0 };
  }

  public async execute(
    notebookId: string,
    topic: string,
    options: DeepWorkflowOptions = {}
  ): Promise<DeepWorkflowResult> {
    const { taskId } = await this.start(notebookId, topic);
    if (options.detach) {
      return { taskId, status: 'IN_PROGRESS', synthesis: '', sources: [] };
    }

    const pollRes = await this.pollUntilComplete(notebookId, taskId, options);
    const existingSources = await this.fetchSafeSources(notebookId);
    const { ingestedSourceId, curatedImportCount, prunedCount } = await this.processIngestion(
      notebookId, topic, taskId, pollRes, existingSources, options
    );

    const sourceCount = existingSources.length + (ingestedSourceId ? 1 : curatedImportCount) - prunedCount;
    return {
      taskId,
      status: pollRes.status,
      synthesis: pollRes.synthesis || '',
      sources: pollRes.sources,
      ingestedSourceId,
      curatedImportCount,
      prunedCount,
      quotaWarning: sourceCount >= MAX_SAFE_SOURCE_COUNT,
      sourceCount
    };
  }

  private async fetchSafeSources(notebookId: string): Promise<NotebookSourceSummary[]> {
    try {
      return await this.client.listSources(notebookId);
    } catch {
      return [];
    }
  }

  private async handleCuratedIngest(
    notebookId: string,
    taskId: string,
    sources: DiscoveredSource[],
    existingSources: NotebookSourceSummary[],
    options: DeepWorkflowOptions
  ): Promise<{ importedCount: number; prunedCount: number }> {
    const curated = await this.pipeline.filterAndRank(sources, {
      maxCuratedCount: options.maxCuratedSources ?? 5,
      httpHeadChecker: options.httpHeadChecker,
      existingSources
    });
    if (curated.selectedSources.length === 0) return { importedCount: 0, prunedCount: 0 };

    const selectedIndices = curated.selectedSources.map((_, i) => i);
    const totalAfter = existingSources.length + curated.selectedSources.length;

    if (totalAfter > MAX_SAFE_SOURCE_COUNT) {
      const needed = totalAfter - 40;
      const approved = await this.pruningEngine.filterAutonomousApproved(existingSources);
      const toPrune = approved.slice(0, Math.max(1, needed)).map(c => ({ id: c.sourceId, title: c.title, type: 'document' }));

      const swap = await this.vaultManager.executeTransactionalSwap(
        notebookId,
        toPrune,
        async () => this.client.importResearchSources(notebookId, taskId, selectedIndices),
        this.client
      );
      return { importedCount: curated.selectedSources.length, prunedCount: swap.prunedCount };
    }

    await this.client.importResearchSources(notebookId, taskId, selectedIndices);
    return { importedCount: curated.selectedSources.length, prunedCount: 0 };
  }

  private async pollUntilComplete(
    notebookId: string,
    taskId: string,
    options: DeepWorkflowOptions
  ): Promise<ResearchPollResult> {
    const maxAttempts = options.maxPollAttempts ?? 30;
    const sleepFn = options.sleeper || NotebookLmDeepResearchWorkflow.defaultSleep;
    let currentInterval = options.pollIntervalMs ?? 5000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await this.poll(notebookId, taskId);
      if (res.status === 'COMPLETED' || res.status === 'FAILED') {
        return res;
      }
      await sleepFn(currentInterval);
      currentInterval = Math.min(Math.round(currentInterval * 1.3), 30000);
    }

    return { status: 'IN_PROGRESS', taskId, sources: [] };
  }

  public static formatDigest(topic: string, poll: ResearchPollResult): string {
    const lines: string[] = [
      `# 📑 Deep Architectural Research: ${topic}`,
      `*Generated via Aegis Zero-Chromium Engine on ${new Date().toISOString().split('T')[0]}*`,
      '',
      '## 🔍 Executive Synthesis',
      poll.synthesis || 'No synthesis generated.',
      '',
      '## 📚 Primary Discovered Sources',
      ...poll.sources.map((s, idx) => `${idx + 1}. **${s.title}**: ${s.url || s.snippet || 'Reference'}`)
    ];
    return lines.join('\n');
  }

  private static async defaultSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
