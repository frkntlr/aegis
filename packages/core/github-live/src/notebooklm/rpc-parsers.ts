/**
 * @file rpc-parsers.ts
 * Protocol parsers and payload formatters for Google Labs Tailwind batchexecute RPCs.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type {
  NotebookCitation,
  NotebookQueryResult,
  NotebookSummary,
  ResearchPollResult,
  NotebookSourceSummary,
  DiscoveredSource
} from './types.js';

export class RpcParsers {
  public static formatPayload(rpcName: string, params: unknown[]): string {
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

    const cleaned = RpcParsers.extractReadableText(rawText);
    return {
      answer: cleaned.trim() || 'No answer received from NotebookLM.',
      citations,
      conversationId: `conv-${Date.now()}`
    };
  }

  public static parseNotebookList(rawText: string): NotebookSummary[] {
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

  public static parsePollResponse(taskId: string, rawText: string): ResearchPollResult {
    const isFailed = rawText.includes('"FAILED"') || rawText.includes('"error"');
    const isCompleted = rawText.includes('"COMPLETED"') || rawText.includes('"sources"') || rawText.includes('http');
    const status = isFailed ? 'FAILED' : (isCompleted ? 'COMPLETED' : 'IN_PROGRESS');

    const sources: DiscoveredSource[] = [];
    const urlRegex = /"(https?:\/\/[^"]+)"/g;
    let urlMatch = urlRegex.exec(rawText);
    let idx = 1;
    while (urlMatch !== null && sources.length < 50) {
      const url = urlMatch[1];
      if (!url.includes('google.com') && !sources.some(s => s.url === url)) {
        sources.push({ title: `Discovered Source ${idx++}`, url, snippet: url });
      }
      urlMatch = urlRegex.exec(rawText);
    }

    const synthesis = RpcParsers.extractReadableText(rawText);
    return { status, taskId, sources, synthesis: synthesis.length > 20 ? synthesis : undefined };
  }

  public static parseSourceList(rawText: string): NotebookSourceSummary[] {
    const sources: NotebookSourceSummary[] = [];
    const itemRegex = /\["([a-zA-Z0-9_-]{12,40})",\s*"([^"]+)"/g;
    const seen = new Set<string>();

    let m = itemRegex.exec(rawText);
    while (m !== null) {
      const id = m[1];
      const title = m[2];
      if (!seen.has(id)) {
        seen.add(id);
        sources.push({ id, title, type: 'document', updatedAt: new Date().toISOString() });
      }
      m = itemRegex.exec(rawText);
    }
    return sources;
  }

  public static extractReadableText(raw: string): string {
    const cleanLines = raw
      .split('\n')
      .filter(l => !l.startsWith(')]}\'') && !l.startsWith('[') && l.trim().length > 0)
      .join('\n');
    return cleanLines.length > 20 ? cleanLines : raw;
  }
}
