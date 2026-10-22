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

export interface ProjectV2Info {
  id: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
  itemCount?: number;
}

export interface ProjectStatusOption {
  id: string;
  name: string;
}

export interface ProjectV2ItemInfo {
  id: string;
  issueNumber?: number;
  title: string;
  statusName?: string;
}
