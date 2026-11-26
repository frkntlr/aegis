/**
 * @file notebooklm-native-client.ts
 * Self-contained, zero-Chromium native HTTP client for Google NotebookLM.
 * Implements batchexecute protocol with deep research, source ingestion & tombstone pruning.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { fetchPostWithTimeout } from './http-transport.js';
import { MultiRootTokenResolver } from './multi-root-token-resolver.js';
import { RpcParsers } from './rpc-parsers.js';
import type {
  NotebookQueryResult,
  NotebookSummary,
  HttpPostFunction,
  ResearchPollResult,
  NotebookSourceSummary
} from './types.js';

export interface NativeClientOptions {
  cookies?: string;
  notebookId?: string;
  httpPost?: HttpPostFunction;
  timeoutMs?: number;
}

interface RpcCallContext {
  httpPost: HttpPostFunction;
  cookies: string;
  timeoutMs: number;
  rpcName: string;
  params: unknown[];
  refererPath?: string;
}

const DEFAULT_BASE_URL = 'https://notebooklm.google.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function executeBatchexecuteRpc(ctx: RpcCallContext): Promise<string> {
  const endpoint = `${DEFAULT_BASE_URL}/_/LabsTailwindUi/data/batchexecute`;
  const body = RpcParsers.formatPayload(ctx.rpcName, ctx.params);
  const headers: Record<string, string> = {
    'Cookie': ctx.cookies,
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'Origin': DEFAULT_BASE_URL,
    'Referer': ctx.refererPath ? `${DEFAULT_BASE_URL}${ctx.refererPath}` : DEFAULT_BASE_URL
  };

  const res = await ctx.httpPost(endpoint, body, { headers, timeoutMs: ctx.timeoutMs });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`NotebookLM Authentication Rejected (HTTP ${res.status}). Session cookies may have expired.`);
  }
  if (res.status !== 200) {
    throw new Error(`NotebookLM RPC ${ctx.rpcName} failed (HTTP ${res.status}).`);
  }
  return res.text();
}

export class NotebookLmClientCodec {
  public static formatBatchExecutePayload(rpcName: string, params: unknown[]): string {
    return RpcParsers.formatPayload(rpcName, params);
  }

  public static parseQueryResponse(rawText: string): NotebookQueryResult {
    return RpcParsers.parseQueryResponse(rawText);
  }

  public static parseNotebookListResponse(rawText: string): NotebookSummary[] {
    return RpcParsers.parseNotebookList(rawText);
  }
}

export class NotebookLmNativeClient extends NotebookLmClientCodec {
  private cookies: string;
  private httpPost: HttpPostFunction;
  private timeoutMs: number;

  constructor(options: NativeClientOptions = {}) {
    super();
    this.cookies = options.cookies || MultiRootTokenResolver.resolve().cookies;
    this.httpPost = options.httpPost || ((u, b, o) => fetchPostWithTimeout(u, b, o, 30000));
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  public getCookies(): string { return this.cookies; }
  public updateCookies(newCookies: string): void { this.cookies = newCookies; }

  public async query(notebookId: string, prompt: string): Promise<NotebookQueryResult> {
    const raw = await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'GenerateFreeFormStreamed', params: [notebookId, prompt], refererPath: `/notebook/${notebookId}`
    });
    return RpcParsers.parseQueryResponse(raw);
  }

  public async listNotebooks(): Promise<NotebookSummary[]> {
    const raw = await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'ListNotebooks', params: []
    });
    return RpcParsers.parseNotebookList(raw);
  }

  public async startResearch(
    notebookId: string,
    topic: string,
    source = 'web',
    mode = 'fast'
  ): Promise<{ task_id?: string }> {
    const raw = await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'StartResearch', params: [notebookId, topic, source, mode], refererPath: `/notebook/${notebookId}`
    });
    const match = raw.match(/"task_id"\s*:\s*"([^"]+)"/) || raw.match(/\["([a-f0-9-]{16,})"/);
    return { task_id: match ? match[1] : undefined };
  }

  public async pollResearch(notebookId: string, taskId: string): Promise<ResearchPollResult> {
    const raw = await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'PollResearch', params: [notebookId, taskId], refererPath: `/notebook/${notebookId}`
    });
    return RpcParsers.parsePollResponse(taskId, raw);
  }

  public async addTextSource(notebookId: string, title: string, content: string): Promise<{ sourceId?: string }> {
    const raw = await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'AddTextSource', params: [notebookId, title, content], refererPath: `/notebook/${notebookId}`
    });
    const match = raw.match(/\["([a-zA-Z0-9_-]{12,40})"/);
    return { sourceId: match ? match[1] : `src-${Date.now()}` };
  }

  public async importResearchSources(notebookId: string, taskId: string, sourceIndices: number[] = []): Promise<{ success: boolean }> {
    await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'ImportDiscoveredSources', params: [notebookId, taskId, sourceIndices], refererPath: `/notebook/${notebookId}`
    });
    return { success: true };
  }

  public async listSources(notebookId: string): Promise<NotebookSourceSummary[]> {
    const raw = await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'ListSources', params: [notebookId], refererPath: `/notebook/${notebookId}`
    });
    return RpcParsers.parseSourceList(raw);
  }

  public async deleteSource(sourceId: string): Promise<{ success: boolean }> {
    await executeBatchexecuteRpc({
      httpPost: this.httpPost, cookies: this.cookies, timeoutMs: this.timeoutMs,
      rpcName: 'DeleteSource', params: [sourceId]
    });
    return { success: true };
  }
}
