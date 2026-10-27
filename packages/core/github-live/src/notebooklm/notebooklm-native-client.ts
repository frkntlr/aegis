/**
 * @file notebooklm-native-client.ts
 * Self-contained, zero-Chromium native HTTP client for Google NotebookLM.
 * Implements batchexecute protocol with deep research, source ingestion & tombstone pruning.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { MultiRootTokenResolver } from './multi-root-token-resolver.js';
import { RpcParsers } from './rpc-parsers.js';
import type {
  NotebookQueryResult,
  NotebookSummary,
  HttpPostFunction,
  HttpResponse,
  ResearchPollResult,
  NotebookSourceSummary
} from './types.js';

export interface NativeClientOptions {
  cookies?: string;
  notebookId?: string;
  httpPost?: HttpPostFunction;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://notebooklm.google.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class NotebookLmNativeClient {
  private cookies: string;
  private httpPost: HttpPostFunction;
  private timeoutMs: number;

  constructor(options: NativeClientOptions = {}) {
    this.cookies = options.cookies || MultiRootTokenResolver.resolve().cookies;
    this.httpPost = options.httpPost || NotebookLmNativeClient.defaultFetchPost;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  public getCookies(): string { return this.cookies; }
  public updateCookies(newCookies: string): void { this.cookies = newCookies; }

  private async executeRpc(rpcName: string, params: unknown[], refererPath?: string): Promise<string> {
    const endpoint = `${DEFAULT_BASE_URL}/_/LabsTailwindUi/data/batchexecute`;
    const body = RpcParsers.formatPayload(rpcName, params);
    const headers: Record<string, string> = {
      'Cookie': this.cookies,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Origin': DEFAULT_BASE_URL,
      'Referer': refererPath ? `${DEFAULT_BASE_URL}${refererPath}` : DEFAULT_BASE_URL
    };

    const res = await this.httpPost(endpoint, body, { headers, timeoutMs: this.timeoutMs });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`NotebookLM Authentication Rejected (HTTP ${res.status}). Session cookies may have expired.`);
    }
    if (res.status !== 200) {
      throw new Error(`NotebookLM RPC ${rpcName} failed (HTTP ${res.status}).`);
    }
    return res.text();
  }

  public async query(notebookId: string, prompt: string): Promise<NotebookQueryResult> {
    const raw = await this.executeRpc('GenerateFreeFormStreamed', [notebookId, prompt], `/notebook/${notebookId}`);
    return RpcParsers.parseQueryResponse(raw);
  }

  public async listNotebooks(): Promise<NotebookSummary[]> {
    const raw = await this.executeRpc('ListNotebooks', []);
    return RpcParsers.parseNotebookList(raw);
  }

  public async startResearch(
    notebookId: string,
    topic: string,
    source = 'web',
    mode = 'fast'
  ): Promise<{ task_id?: string }> {
    const raw = await this.executeRpc('StartResearch', [notebookId, topic, source, mode], `/notebook/${notebookId}`);
    const match = raw.match(/"task_id"\s*:\s*"([^"]+)"/) || raw.match(/\["([a-f0-9-]{16,})"/);
    return { task_id: match ? match[1] : undefined };
  }

  public async pollResearch(notebookId: string, taskId: string): Promise<ResearchPollResult> {
    const raw = await this.executeRpc('PollResearch', [notebookId, taskId], `/notebook/${notebookId}`);
    return RpcParsers.parsePollResponse(taskId, raw);
  }

  public async addTextSource(notebookId: string, title: string, content: string): Promise<{ sourceId?: string }> {
    const raw = await this.executeRpc('AddTextSource', [notebookId, title, content], `/notebook/${notebookId}`);
    const match = raw.match(/\["([a-zA-Z0-9_-]{12,40})"/);
    return { sourceId: match ? match[1] : `src-${Date.now()}` };
  }

  public async importResearchSources(notebookId: string, taskId: string, sourceIndices: number[] = []): Promise<{ success: boolean }> {
    await this.executeRpc('ImportDiscoveredSources', [notebookId, taskId, sourceIndices], `/notebook/${notebookId}`);
    return { success: true };
  }

  public async listSources(notebookId: string): Promise<NotebookSourceSummary[]> {
    const raw = await this.executeRpc('ListSources', [notebookId], `/notebook/${notebookId}`);
    return RpcParsers.parseSourceList(raw);
  }

  public async deleteSource(sourceId: string): Promise<{ success: boolean }> {
    await this.executeRpc('DeleteSource', [sourceId]);
    return { success: true };
  }

  public static formatBatchExecutePayload(rpcName: string, params: unknown[]): string {
    return RpcParsers.formatPayload(rpcName, params);
  }

  public static parseQueryResponse(rawText: string): NotebookQueryResult {
    return RpcParsers.parseQueryResponse(rawText);
  }

  public static parseNotebookListResponse(rawText: string): NotebookSummary[] {
    return RpcParsers.parseNotebookList(rawText);
  }

  private static async defaultFetchPost(
    url: string,
    body: string,
    options?: { headers?: Record<string, string>; timeoutMs?: number }
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 30000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: options?.headers,
        body,
        signal: controller.signal
      });
      const headerObj: Record<string, string> = {};
      res.headers.forEach((v, k) => { headerObj[k.toLowerCase()] = v; });
      return { status: res.status, text: () => res.text(), headers: headerObj };
    } finally {
      clearTimeout(timer);
    }
  }
}
