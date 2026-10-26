/**
 * @file notebooklm-native-client.ts
 * Self-contained, zero-Chromium native HTTP client for Google NotebookLM.
 * Implements Google RPC streaming parser and batchexecute protocol with zero external dependencies.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { MultiRootTokenResolver } from './multi-root-token-resolver.js';
import type {
  NotebookQueryResult,
  NotebookSummary,
  NotebookCitation,
  HttpPostFunction,
  HttpResponse
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

  public getCookies(): string {
    return this.cookies;
  }

  public updateCookies(newCookies: string): void {
    this.cookies = newCookies;
  }

  public async query(notebookId: string, prompt: string): Promise<NotebookQueryResult> {
    const endpoint = `${DEFAULT_BASE_URL}/_/LabsTailwindUi/data/batchexecute`;
    const params = [notebookId, prompt];
    const body = NotebookLmNativeClient.formatBatchExecutePayload('GenerateFreeFormStreamed', params);

    const headers: Record<string, string> = {
      'Cookie': this.cookies,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Origin': DEFAULT_BASE_URL,
      'Referer': `${DEFAULT_BASE_URL}/notebook/${notebookId}`
    };

    const res = await this.httpPost(endpoint, body, { headers, timeoutMs: this.timeoutMs });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`NotebookLM Authentication Rejected (HTTP ${res.status}). Session cookies may have expired.`);
    }
    if (res.status !== 200) {
      throw new Error(`NotebookLM request failed (HTTP ${res.status}).`);
    }

    const raw = await res.text();
    return NotebookLmNativeClient.parseQueryResponse(raw);
  }

  public async listNotebooks(): Promise<NotebookSummary[]> {
    const endpoint = `${DEFAULT_BASE_URL}/_/LabsTailwindUi/data/batchexecute`;
    const body = NotebookLmNativeClient.formatBatchExecutePayload('ListNotebooks', []);

    const headers: Record<string, string> = {
      'Cookie': this.cookies,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Origin': DEFAULT_BASE_URL
    };

    const res = await this.httpPost(endpoint, body, { headers, timeoutMs: this.timeoutMs });
    if (res.status !== 200) {
      throw new Error(`Failed to list notebooks (HTTP ${res.status}).`);
    }

    const raw = await res.text();
    return NotebookLmNativeClient.parseNotebookListResponse(raw);
  }

  public async startResearch(
    notebookId: string,
    topic: string,
    source = 'web',
    mode = 'fast'
  ): Promise<{ task_id?: string }> {
    const endpoint = `${DEFAULT_BASE_URL}/_/LabsTailwindUi/data/batchexecute`;
    const body = NotebookLmNativeClient.formatBatchExecutePayload('StartResearch', [notebookId, topic, source, mode]);

    const headers: Record<string, string> = {
      'Cookie': this.cookies,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Origin': DEFAULT_BASE_URL
    };

    const res = await this.httpPost(endpoint, body, { headers, timeoutMs: this.timeoutMs });
    const raw = await res.text();
    const taskIdMatch = raw.match(/"task_id"\s*:\s*"([^"]+)"/) || raw.match(/\["([a-f0-9-]{16,})"/);
    return { task_id: taskIdMatch ? taskIdMatch[1] : undefined };
  }

  public static formatBatchExecutePayload(rpcName: string, params: unknown[]): string {
    const rpcData = [[[rpcName, JSON.stringify(params), null, 'generic']]];
    const usp = new URLSearchParams();
    usp.append('f.req', JSON.stringify(rpcData));
    return usp.toString();
  }

  public static parseQueryResponse(rawText: string): NotebookQueryResult {
    const citations: NotebookCitation[] = [];
    const citeRegex = /\[cite:\s*([^\]]+)\]/g;
    let match: RegExpExecArray | null = citeRegex.exec(rawText);
    while (match !== null) {
      citations.push({ title: match[1].trim(), sourceId: match[1].trim() });
      match = citeRegex.exec(rawText);
    }

    let cleaned = rawText;
    const jsonChunks = rawText.match(/\["[a-zA-Z0-9_\-.]+",\s*\[.*?\]\]/s);
    if (jsonChunks) {
      cleaned = NotebookLmNativeClient.extractReadableText(rawText);
    }

    return {
      answer: cleaned.trim() || 'No answer received from NotebookLM.',
      citations,
      conversationId: `conv-${Date.now()}`
    };
  }

  public static parseNotebookListResponse(rawText: string): NotebookSummary[] {
    const list: NotebookSummary[] = [];
    const idRegex = /"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"/g;
    const foundIds = new Set<string>();

    let m: RegExpExecArray | null = idRegex.exec(rawText);
    while (m !== null) {
      if (!foundIds.has(m[1])) {
        foundIds.add(m[1]);
        list.push({ id: m[1], title: `Notebook ${m[1].slice(0, 8)}` });
      }
      m = idRegex.exec(rawText);
    }

    return list;
  }

  private static extractReadableText(raw: string): string {
    const cleanLines = raw
      .split('\n')
      .filter(l => !l.startsWith(')]}\'') && !l.startsWith('[') && l.trim().length > 0)
      .join('\n');
    return cleanLines.length > 20 ? cleanLines : raw;
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
      return {
        status: res.status,
        text: () => res.text(),
        headers: headerObj
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
