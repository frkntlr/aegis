export interface GitHubKanbanStatus {
  connected: boolean;
  owner: string;
  repo: string;
  user: string;
  issuesCount: number;
  rateRemaining?: number;
}

export interface SystemIssue {
  id: number;
  number: number;
  title: string;
  status: 'ready' | 'in_progress' | 'blocked' | 'review' | 'done';
  targetFiles: string[];
  assignedAgent?: string;
  assignedIde?: string;
  labels: string[];
  body?: string;
  acceptanceCriteria?: string[];
  url?: string;
}

export interface SystemMetrics {
  tokenMetrics: {
    usedTokens: number;
    cachedTokens: number;
    savingsPercent: number;
    filesScanned: number;
  };
  qualityShields: {
    tdd: 'PASS' | 'FAIL';
    ironCage: 'PASS' | 'FAIL';
    deadCode: 'PASS' | 'FAIL';
    trustVerifier: 'PASS' | 'FAIL';
    labels: {
      tdd: string;
      ironCage: string;
      deadCode: string;
      trustVerifier: string;
    };
  };
  issues: SystemIssue[];
  settings?: Record<string, unknown>;
  github?: GitHubKanbanStatus;
}
