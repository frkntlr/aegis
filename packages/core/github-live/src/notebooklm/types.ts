/**
 * @file types.ts
 * Type definitions for Self-Contained NotebookLM Integration & Token Resolution.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface NotebookCitation {
  title?: string;
  sourceId?: string;
}

export interface NotebookQueryResult {
  answer: string;
  citations: NotebookCitation[];
  conversationId?: string;
}

export interface NotebookSummary {
  id: string;
  title: string;
}

export interface TokenResolveResult {
  cookies: string;
  source: 'env' | 'project' | 'global' | 'none';
  filePath?: string;
  hasPsidts: boolean;
  hasSid: boolean;
}

export interface HttpTransportOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  text: () => Promise<string>;
  headers: Record<string, string | string[]>;
}

export type HttpPostFunction = (
  url: string,
  body: string,
  options?: HttpTransportOptions
) => Promise<HttpResponse>;
