export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: string[];
  status: 'ready' | 'in_progress' | 'blocked' | 'review' | 'done';
  assignee?: string;
  targetFiles: string[];
  acceptanceCriteria: string[];
  url?: string;
}

export interface WikiPage {
  slug: string;
  title: string;
  threeBulletSummary: [string, string, string];
  content: string;
  lastUpdated: string;
}

export interface DiscussionItem {
  id: string;
  title: string;
  body: string;
  convertedToIssueIds: number[];
}
