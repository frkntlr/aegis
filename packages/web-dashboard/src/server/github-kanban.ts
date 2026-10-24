import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubLiveAdapter, GitHubProjectsAdapter, GitHubTokenResolver, RateLimitInfo } from '@aegis/github-live';
import type { SystemIssue } from './realtime-metrics.js';
import { INITIAL_DEFAULT_ISSUES, buildIssueBody, buildQualityGateComment } from './kanban-templates.js';

export interface GitHubKanbanOptions {
  repoRoot?: string;
  offline?: boolean;
  adapter?: GitHubLiveAdapter;
  projectsAdapter?: GitHubProjectsAdapter;
  projectNumber?: number;
}

export interface GitHubKanbanStatus {
  connected: boolean;
  owner: string;
  repo: string;
  user: string;
  issuesCount: number;
  rateRemaining?: number;
}

export class GitHubKanbanService {
  private repoRoot: string;
  private adapter?: GitHubLiveAdapter;
  private projectsAdapter?: GitHubProjectsAdapter;
  private projectNumber: number = 4;
  private owner: string = 'frkntlr';
  private repo: string = 'aegis';
  private user: string = 'autonomous-agent';
  private connected: boolean = false;
  private issues: SystemIssue[] = [];
  private lastRateLimit?: RateLimitInfo;

  constructor(options: GitHubKanbanOptions = {}) {
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.projectNumber = options.projectNumber ?? 4;
    this.initOfflineDefaults();
    const isTest =
      process.env.NODE_ENV === 'test' ||
      process.env.npm_lifecycle_event === 'test' ||
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      process.execArgv.includes('--test');
    if (!options.offline && !isTest) {
      this.initAdapter(options.adapter, options.projectsAdapter);
    }
  }

  private initOfflineDefaults(): void {
    const sFile = path.resolve(this.repoRoot, '.aegis', 'issues.json');
    if (fs.existsSync(sFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(sFile, 'utf8'));
        if (Array.isArray(raw) && raw.length > 0) {
          this.issues = raw;
          return;
        }
      } catch { /* ignore */ }
    }
    this.issues = [...INITIAL_DEFAULT_ISSUES];
  }

  private persistIssues(): void {
    try {
      const sFile = path.resolve(this.repoRoot, '.aegis', 'issues.json');
      fs.mkdirSync(path.dirname(sFile), { recursive: true });
      fs.writeFileSync(sFile, JSON.stringify(this.issues, null, 2), 'utf8');
    } catch { /* non-fatal */ }
  }

  private initAdapter(customAdapter?: GitHubLiveAdapter, customProj?: GitHubProjectsAdapter): void {
    if (customAdapter) {
      this.adapter = customAdapter;
      this.projectsAdapter = customProj;
      this.connected = true;
      return;
    }
    const auth = GitHubTokenResolver.resolve();
    if (auth.hasCredentials && auth.token) {
      this.owner = auth.owner || this.owner;
      this.repo = auth.repo || this.repo;
      this.adapter = new GitHubLiveAdapter({
        token: auth.token,
        owner: this.owner,
        repo: this.repo
      });
      this.projectsAdapter = new GitHubProjectsAdapter({
        token: auth.token,
        owner: this.owner,
        repo: this.repo
      });
      this.connected = true;
      this.fetchUser();
    }
  }

  private async fetchUser(): Promise<void> {
    if (!this.adapter) return;
    try {
      const { user, rateLimit } = await this.adapter.getAuthenticatedUser();
      this.user = user.login;
      this.lastRateLimit = rateLimit;
    } catch {
      this.user = 'github-user';
    }
  }

  public async fetchLiveIssues(): Promise<SystemIssue[]> {
    if (!this.adapter || !this.connected) return [...this.issues];
    try {
      const { issues, rateLimit } = await this.adapter.listIssues(this.owner, this.repo, 'all');
      this.lastRateLimit = rateLimit;
      const mapped: SystemIssue[] = issues.map(iss => {
        const existing = this.issues.find(i => i.number === iss.number);
        const isDone = iss.status === 'done';
        const assignedAgent = isDone ? undefined : (iss.assignee || existing?.assignedAgent);
        const assignedIde = isDone ? undefined : (assignedAgent ? (existing?.assignedIde || 'Google Antigravity') : undefined);
        const cleanLabels = isDone
          ? [...iss.labels.filter(l => !l.startsWith('status:')), 'status:done']
          : iss.labels;
        return {
          id: iss.id,
          number: iss.number,
          title: iss.title,
          status: iss.status,
          targetFiles: iss.targetFiles,
          labels: cleanLabels,
          assignedAgent,
          assignedIde,
          body: iss.body,
          acceptanceCriteria: iss.acceptanceCriteria,
          url: iss.url || `https://github.com/${this.owner}/${this.repo}/issues/${iss.number}`
        };
      });
      this.issues = mapped;
      return mapped;
    } catch {
      if (this.issues.length === 0) this.initOfflineDefaults();
      return [...this.issues];
    }
  }

  private createLocalIssue(title: string, targetFiles: string[], labels: string[], body: string): SystemIssue {
    const nextNum = this.issues.length > 0 ? Math.max(...this.issues.map(i => i.number)) + 1 : 1;
    const localIssue: SystemIssue = {
      id: nextNum, number: nextNum, title, status: 'ready',
      targetFiles, labels, body,
      url: `https://github.com/${this.owner}/${this.repo}/issues/${nextNum}`
    };
    this.issues.unshift(localIssue);
    this.persistIssues();
    return localIssue;
  }

  public async createIssue(title: string, targetFiles: string[] = []): Promise<SystemIssue> {
    const defaultBody = buildIssueBody(title, targetFiles);
    const labels = ['status:ready', 'aegis:task', ...targetFiles.map(f => `lock:${f}`)];

    if (this.adapter && this.connected) {
      try {
        const { issue, rateLimit } = await this.adapter.createIssue(title, defaultBody, labels);
        this.lastRateLimit = rateLimit;
        const newIssue: SystemIssue = {
          id: issue.id, number: issue.number, title: issue.title, status: 'ready',
          targetFiles, labels, body: defaultBody, acceptanceCriteria: issue.acceptanceCriteria,
          url: issue.url || `https://github.com/${this.owner}/${this.repo}/issues/${issue.number}`
        };
        this.issues.unshift(newIssue);
        this.persistIssues();
        if (this.projectsAdapter && issue.number) {
          this.projectsAdapter.syncIssue(this.projectNumber, issue.number, 'ready').catch(() => { /* no-op */ });
        }
        return newIssue;
      } catch { /* ignore */ }
    }
    return this.createLocalIssue(title, targetFiles, labels, defaultBody);
  }

  public updateIssueStatus(num: number, targetStatus: SystemIssue['status'], agent?: string, ide?: string): SystemIssue | null {
    const issue = this.issues.find(i => i.number === num);
    if (!issue) return null;
    issue.status = targetStatus;
    issue.labels = [...issue.labels.filter(l => !l.startsWith('status:')), `status:${targetStatus}`];
    if (targetStatus === 'in_progress') {
      issue.assignedAgent = agent || 'solver';
      issue.assignedIde = ide || 'Google Antigravity';
    } else if (targetStatus === 'ready' || targetStatus === 'done') {
      issue.assignedAgent = undefined;
      issue.assignedIde = undefined;
    }
    this.persistIssues();
    this.dispatchGitHubStatusUpdate(num, targetStatus, issue, agent, ide);
    return issue;
  }

  private dispatchGitHubStatusUpdate(num: number, targetStatus: SystemIssue['status'], issue: SystemIssue, agent?: string, ide?: string): void {
    if (!this.adapter || !this.connected) return;
    const remainingLabels = issue.labels.filter(l => !l.startsWith('status:'));
    const newLabels = [...remainingLabels, `status:${targetStatus}`];
    const state = targetStatus === 'done' ? 'closed' : 'open';

    let verifiedBody = issue.body;
    if (targetStatus === 'done' && issue.body) {
      verifiedBody = issue.body.replace(/- \[ \]/g, '- [x]');
      issue.body = verifiedBody;
    }

    this.adapter.updateIssue(num, { state, labels: newLabels, body: verifiedBody }).then(() => {
      if (targetStatus === 'in_progress') {
        const ag = agent || 'solver';
        const tool = ide || 'Google Antigravity';
        this.adapter?.addComment(num, `🤖 **Aegis Fleet**: Agent \`@${ag}\` (${tool}) claimed this task.\nLocks: ${issue.targetFiles.map(f => `\`${f}\``).join(', ')}`);
      } else if (targetStatus === 'done') {
        const report = buildQualityGateComment(agent, ide);
        this.adapter?.addComment(num, report);
      } else if (targetStatus === 'blocked') {
        this.adapter?.addComment(num, `🛑 **Aegis Loop Breaker**: Task marked as blocked. Locks released.`);
      }
    }).catch(() => { /* no-op */ });

    if (this.projectsAdapter) {
      const pStatus = targetStatus === 'in_progress' ? 'in_progress' : targetStatus === 'done' ? 'done' : 'ready';
      this.projectsAdapter.syncIssue(this.projectNumber, num, pStatus).catch(() => { /* no-op */ });
    }
  }

  public getIssues(): SystemIssue[] {
    return [...this.issues];
  }

  public getStatus(): GitHubKanbanStatus {
    return {
      connected: this.connected,
      owner: this.owner,
      repo: this.repo,
      user: this.user,
      issuesCount: this.issues.length,
      rateRemaining: this.lastRateLimit?.remaining
    };
  }
}
