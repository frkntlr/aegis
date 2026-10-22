import { GitHubTokenResolver } from './token-resolver.js';
import type { GitHubDomain, GitHubLocationInfo } from './types.js';

export interface ContextRouterOptions {
  owner?: string;
  repo?: string;
  projectNumber?: number;
}

export class GitHubContextRouter {
  private owner: string;
  private repo: string;
  private projectNumber: number;

  constructor(options: ContextRouterOptions = {}) {
    const auth = GitHubTokenResolver.resolve();
    this.owner = options.owner || auth.owner || 'frkntlr';
    this.repo = options.repo || auth.repo || 'aegis';
    this.projectNumber = options.projectNumber || 4;
  }

  private getCollaborationMap(): Record<'wiki' | 'projects' | 'issues', GitHubLocationInfo> {
    return {
      wiki: {
        domain: 'wiki',
        title: 'GitHub Wiki (Living Architecture & Specs)',
        url: `https://github.com/${this.owner}/${this.repo}/wiki`,
        description: 'Living architecture specifications, module contracts, and 3-bullet living memory.',
        accessProtocol: 'git'
      },
      projects: {
        domain: 'projects',
        title: 'GitHub Projects v2 (Roadmap & Autonomous Kanban)',
        url: `https://github.com/users/${this.owner}/projects/${this.projectNumber}`,
        description: 'Live task columns (Todo, In Progress, Done) and sprint prioritization.',
        accessProtocol: 'graphql'
      },
      issues: {
        domain: 'issues',
        title: 'GitHub Issues (Actionable Task Queue)',
        url: `https://github.com/${this.owner}/${this.repo}/issues`,
        description: 'Discrete work items with acceptance criteria, file locks, and status labels.',
        accessProtocol: 'rest'
      }
    };
  }

  private getTechnicalMap(): Record<'discussions' | 'code' | 'research', GitHubLocationInfo> {
    return {
      discussions: {
        domain: 'discussions',
        title: 'GitHub Discussions (Community RFCs & Ideas)',
        url: `https://github.com/${this.owner}/${this.repo}/discussions`,
        description: 'Community-driven feature proposals, architectural debates, and RFC triage.',
        accessProtocol: 'graphql'
      },
      code: {
        domain: 'code',
        title: 'GitHub Codebase & AST Skeletons',
        url: `https://github.com/${this.owner}/${this.repo}/tree/master`,
        description: 'Verified source code complying with Demir Kafes (<40 lines/fn, <300 lines/file).',
        accessProtocol: 'git'
      },
      research: {
        domain: 'research',
        title: 'Google NotebookLM (Ground-Truth Research & Citations)',
        url: 'https://notebooklm.google.com',
        description: 'Multi-source architectural research, web research, and cited synthesis.',
        accessProtocol: 'mcp'
      }
    };
  }

  public getLocation(domain: GitHubDomain): GitHubLocationInfo {
    const collab = this.getCollaborationMap();
    if (domain in collab) return collab[domain as keyof typeof collab];
    const tech = this.getTechnicalMap();
    return tech[domain as keyof typeof tech];
  }

  public getAllLocations(): GitHubLocationInfo[] {
    const domains: GitHubDomain[] = ['wiki', 'projects', 'issues', 'discussions', 'code', 'research'];
    return domains.map(d => this.getLocation(d));
  }

  public resolveTargetUrl(domain: GitHubDomain, idOrSlug?: string | number): string {
    const base = this.getLocation(domain).url;
    if (!idOrSlug) return base;
    return `${base}/${idOrSlug}`;
  }

  public describeSystemLocations(): string {
    const locs = this.getAllLocations();
    const lines = [
      '📍 Authoritative GitHub & Research Locations for Aegis:',
      ...locs.map(l => ` • [${l.domain.toUpperCase()}] ${l.title}\n    URL: ${l.url}\n    Role: ${l.description}`)
    ];
    return lines.join('\n');
  }
}
