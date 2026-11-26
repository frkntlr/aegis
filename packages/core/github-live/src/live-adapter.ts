import { debugLogIgnored } from '@aegis/shared';
import type { GitHubIssue } from './types.js';
import {
  extractIssueBodyDetails,
  parseRateLimitHeaders,
  resolveIssueStatusFromLabels,
  shouldRetryGitHubRequest,
  type GitHubUser,
  type RateLimitInfo,
  type RawGitHubIssue
} from './live-adapter-helpers.js';

export type { GitHubUser, RateLimitInfo, RawGitHubIssue } from './live-adapter-helpers.js';

export interface LiveAdapterOptions {
  token: string;
  owner?: string;
  repo?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class GitHubLiveAdapter {
  private token: string;
  private owner?: string;
  private repo?: string;
  private baseUrl: string;
  private fetch: typeof fetch;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: LiveAdapterOptions) {
    this.token = options.token;
    this.owner = options.owner;
    this.repo = options.repo;
    this.baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.fetch = options.fetchFn ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 0;
    this.retryDelayMs = options.retryDelayMs ?? 100;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<{ data: T; rateLimit: RateLimitInfo }> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/vnd.github.v3+json');
    headers.set('User-Agent', 'Aegis-Autonomous-Engine');

    let attempt = 0;
    while (true) {
      const response = await this.fetch(url, { ...init, headers });
      const rateLimit = parseRateLimitHeaders(response);

      if (shouldRetryGitHubRequest(response.status, attempt, this.maxRetries)) {
        attempt++;
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        const rawDelay = retryAfter > 0 ? retryAfter * 1000 : this.retryDelayMs * 2 ** (attempt - 1);
        const delay = Math.min(rawDelay, 30_000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`GitHub API Error [${response.status}]: ${errText}`);
      }

      const data = (await response.json()) as T;
      return { data, rateLimit };
    }
  }

  public async getAuthenticatedUser(): Promise<{ user: GitHubUser; rateLimit: RateLimitInfo }> {
    const res = await this.request<GitHubUser>('/user');
    return { user: res.data, rateLimit: res.rateLimit };
  }

  public async listIssues(owner?: string, repo?: string, state = 'open'): Promise<{ issues: GitHubIssue[]; rateLimit: RateLimitInfo }> {
    const o = owner ?? this.owner;
    const r = repo ?? this.repo;
    if (!o || !r) throw new Error('Repository owner and name must be specified.');

    const res = await this.request<RawGitHubIssue[]>(`/repos/${o}/${r}/issues?state=${state}`);
    const issues: GitHubIssue[] = res.data.map(raw => this.transformRawIssue(raw));

    return { issues, rateLimit: res.rateLimit };
  }

  public async createIssue(title: string, body: string, labels: string[] = []): Promise<{ issue: GitHubIssue; rateLimit: RateLimitInfo }> {
    if (!this.owner || !this.repo) throw new Error('Repository owner and name must be specified.');

    const res = await this.request<RawGitHubIssue>(`/repos/${this.owner}/${this.repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels })
    });

    return { issue: this.transformRawIssue(res.data), rateLimit: res.rateLimit };
  }

  public async updateIssue(
    issueNumber: number,
    updates: { state?: 'open' | 'closed'; labels?: string[]; body?: string; title?: string }
  ): Promise<{ issue: GitHubIssue; rateLimit: RateLimitInfo; state?: string }> {
    if (!this.owner || !this.repo) throw new Error('Repository owner and name must be specified.');

    const res = await this.request<RawGitHubIssue>(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    return { issue: this.transformRawIssue(res.data), rateLimit: res.rateLimit, state: res.data.state };
  }

  public async addComment(
    issueNumber: number,
    body: string
  ): Promise<{ id: number; url: string; rateLimit: RateLimitInfo }> {
    if (!this.owner || !this.repo) throw new Error('Repository owner and name must be specified.');

    const res = await this.request<{ id: number; html_url: string }>(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body })
      }
    );

    return { id: res.data.id, url: res.data.html_url, rateLimit: res.rateLimit };
  }

  public async createPullRequest(options: {
    title: string;
    head: string;
    base: string;
    body: string;
    draft?: boolean;
  }): Promise<{ number: number; htmlUrl: string; rateLimit: RateLimitInfo }> {
    if (!this.owner || !this.repo) throw new Error('Repository owner and name must be specified.');

    const res = await this.request<{ number: number; html_url: string }>(
      `/repos/${this.owner}/${this.repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: options.title,
          head: options.head,
          base: options.base,
          body: options.body,
          draft: options.draft ?? false
        })
      }
    );

    return { number: res.data.number, htmlUrl: res.data.html_url, rateLimit: res.rateLimit };
  }

  public async graphqlQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.request<{ data: T; errors?: unknown[] }>('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables })
    });

    if (res.data.errors && res.data.errors.length > 0) {
      throw new Error(`GitHub GraphQL Error: ${JSON.stringify(res.data.errors)}`);
    }

    return res.data.data;
  }

  public async ensureLabel(name: string, color = '0E8A16', description = ''): Promise<void> {
    if (!this.owner || !this.repo) return;
    try {
      await this.request(`/repos/${this.owner}/${this.repo}/labels`, {
        method: 'POST',
        body: JSON.stringify({ name, color, description })
      });
    } catch (err: unknown) {
      debugLogIgnored('live-adapter:ensureLabel', err);
    }
  }

  public transformRawIssue(raw: RawGitHubIssue): GitHubIssue {
    const labels = Array.isArray(raw.labels) ? raw.labels.map((l: string | { name: string }) => (typeof l === 'string' ? l : l.name)) : [];
    const body = raw.body || '';
    const targetFiles = labels.filter((l: string) => l.startsWith('lock:')).map((l: string) => l.replace('lock:', '').trim());
    const criteria = extractIssueBodyDetails(body, targetFiles);
    const status = resolveIssueStatusFromLabels(labels, raw.state);
    const cleanLabels = status === 'done'
      ? [...labels.filter((l: string) => !l.startsWith('status:')), 'status:done']
      : labels;

    return {
      id: raw.id,
      number: raw.number,
      title: raw.title,
      body,
      labels: cleanLabels,
      status,
      assignee: status === 'done' ? undefined : (raw.assignee ? raw.assignee.login : undefined),
      targetFiles,
      acceptanceCriteria: criteria.length > 0 ? criteria : ['Pass unit tests', 'No dead code'],
      url: raw.html_url || (raw.number && this.owner && this.repo ? `https://github.com/${this.owner}/${this.repo}/issues/${raw.number}` : undefined)
    };
  }
}
