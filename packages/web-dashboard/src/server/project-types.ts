import { WorktreeManager } from '@aegis/orchestrator';
import { SessionDetector } from './session-detector.js';
import { RealtimeMetricsService } from './realtime-metrics.js';
import { GitHubKanbanService } from './github-kanban.js';

export interface ProjectSummary {
  id: string;
  name: string;
  projectNumber: number;
  repoOwner: string;
  repoName: string;
  localPath?: string;
  isLocalBound: boolean;
  isFocused: boolean;
  lastFocusedAt: string;
}

export interface ProjectContext {
  id: string;
  name: string;
  projectNumber: number;
  repoOwner: string;
  repoName: string;
  localPath: string;
  isLocalBound: boolean;
  lastFocusedAt: string;
  wtManager: WorktreeManager;
  detector: SessionDetector;
  metrics: RealtimeMetricsService;
  kanban: GitHubKanbanService;
}

export interface FocusResult {
  switched: boolean;
  previousProject?: string;
  activeProject: ProjectSummary;
  message: string;
}
