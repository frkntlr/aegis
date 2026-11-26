import type { GitHubIssue } from './types.js';

export interface GitHubUser {
  login: string;
  name: string;
  id: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetDate: string;
}

export interface RawGitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state?: string;
  html_url?: string;
  url?: string;
  assignee?: { login?: string } | null;
  labels?: Array<string | { name: string }>;
}

export function parseRateLimitHeaders(response: Response): RateLimitInfo {
  const limit = parseInt(response.headers.get('x-ratelimit-limit') || '5000', 10);
  const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '4999', 10);
  const resetTime = parseInt(response.headers.get('x-ratelimit-reset') || '0', 10);
  const resetDate = resetTime ? new Date(resetTime * 1000).toISOString() : new Date().toISOString();
  return { limit, remaining, resetDate };
}

export function shouldRetryGitHubRequest(status: number, attempt: number, maxRetries: number): boolean {
  return attempt < maxRetries && (status === 429 || status === 503);
}

export function extractIssueBodyDetails(body: string, targetFiles: string[]): string[] {
  const criteria: string[] = [];
  for (const line of body.split('\n')) {
    const match = line.trim().match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (match) {
      criteria.push(match[2].trim());
    } else {
      const fileMatch = line.trim().match(/^-\s*`([^`]+)`/);
      if (fileMatch) targetFiles.push(fileMatch[1].trim());
    }
  }
  return criteria;
}

export function resolveIssueStatusFromLabels(labels: string[], state?: string): GitHubIssue['status'] {
  if (state === 'closed') return 'done';
  if (labels.includes('status:blocked')) return 'blocked';
  if (labels.includes('status:done')) return 'done';
  if (labels.includes('status:review')) return 'review';
  if (labels.includes('status:in_progress')) return 'in_progress';
  return 'ready';
}
