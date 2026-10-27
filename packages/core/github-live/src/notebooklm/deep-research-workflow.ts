/**
 * @file deep-research-workflow.ts
 * Quota-guarded deep research workflow with exponential backoff polling & digest ingestion.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { NotebookLmNativeClient } from './notebooklm-native-client.js';
import type { ResearchPollResult, DiscoveredSource } from './types.js';

export type IngestMode = 'digest' | 'curated' | 'none';

export interface DeepWorkflowOptions {
  ingestMode?: IngestMode;
  detach?: boolean;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  maxCuratedSources?: number;
  sleeper?: (ms: number) => Promise<void>;
}

export interface DeepWorkflowResult {
  taskId: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
  synthesis: string;
  sources: DiscoveredSource[];
  ingestedSourceId?: string;
  quotaWarning?: boolean;
  sourceCount?: number;
}

const MAX_SAFE_SOURCE_COUNT = 45;

export class NotebookLmDeepResearchWorkflow {
  private client: NotebookLmNativeClient;

  constructor(client?: NotebookLmNativeClient) {
    this.client = client || new NotebookLmNativeClient();
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
    const quotaCheck = await this.checkQuotaSafety(notebookId);

    let ingestedSourceId: string | undefined;
    const ingestMode = options.ingestMode ?? 'digest';

    if (ingestMode === 'digest' && pollRes.synthesis) {
      const digestDoc = NotebookLmDeepResearchWorkflow.formatDigest(topic, pollRes);
      const addRes = await this.client.addTextSource(notebookId, `Research Digest: ${topic}`, digestDoc);
      ingestedSourceId = addRes.sourceId;
    } else if (ingestMode === 'curated' && pollRes.sources.length > 0) {
      const maxK = options.maxCuratedSources ?? 5;
      const indices = pollRes.sources.slice(0, maxK).map((_, i) => i);
      await this.client.importResearchSources(notebookId, taskId, indices);
    }

    return {
      taskId,
      status: pollRes.status,
      synthesis: pollRes.synthesis || '',
      sources: pollRes.sources,
      ingestedSourceId,
      quotaWarning: quotaCheck.warning,
      sourceCount: quotaCheck.count
    };
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

  private async checkQuotaSafety(notebookId: string): Promise<{ warning: boolean; count: number }> {
    try {
      const sources = await this.client.listSources(notebookId);
      return { warning: sources.length >= MAX_SAFE_SOURCE_COUNT, count: sources.length };
    } catch {
      return { warning: false, count: 0 };
    }
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
