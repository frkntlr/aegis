export interface ReclaimCandidate {
  id: number;
  number: number;
  title: string;
  status: 'ready' | 'in_progress' | 'blocked' | 'review' | 'done';
  targetFiles?: string[];
  assignedAgent?: string;
  assignedIde?: string;
  labels?: string[];
}

export interface AgentSessionSummary {
  agentName: string;
  lastHeartbeat?: string | number;
  status?: string;
}

export interface ReclaimResult {
  issueNumber: number;
  title: string;
  previousAgent?: string;
  reason: string;
  reclaimedAt: string;
}

export interface OrphanReclaimerOptions {
  staleTimeoutMs?: number;
  managedAgents?: string[];
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export class OrphanTaskReclaimer {
  private staleTimeoutMs: number;
  private managedAgents: Set<string>;

  constructor(options: OrphanReclaimerOptions = {}) {
    this.staleTimeoutMs = options.staleTimeoutMs ?? 10 * 60 * 1000;
    this.managedAgents = new Set(
      (options.managedAgents ?? ['solver', 'qa', 'docs', 'ui', 'contributor', 'alice', 'bob']).map(a => a.toLowerCase())
    );
  }

  private isAgentSessionActive(
    agentName: string,
    sessions: AgentSessionSummary[]
  ): { active: boolean; reason?: string } {
    const session = sessions.find(s => s.agentName.toLowerCase() === agentName.toLowerCase());
    if (!session) {
      return { active: false, reason: `Agent [${agentName}] has no active registered session.` };
    }
    if (!session.lastHeartbeat) {
      return { active: false, reason: `Agent [${agentName}] registered without heartbeat (missing_heartbeat).` };
    }
    const hbTime = new Date(session.lastHeartbeat).getTime();
    const elapsed = Date.now() - hbTime;
    if (isNaN(hbTime) || elapsed > this.staleTimeoutMs) {
      const mins = Math.round(elapsed / 60000);
      return { active: false, reason: `Agent [${agentName}] heartbeat expired (${mins}m silence).` };
    }
    return { active: true };
  }

  private evaluateIssueStall(
    issue: ReclaimCandidate,
    lockedFiles: Map<string, string>,
    sessions: AgentSessionSummary[]
  ): string | null {
    if (issue.status !== 'in_progress' || issue.labels?.includes('status:done')) return null;
    if (!issue.assignedAgent) {
      return 'Task marked in_progress with no assigned agent (Ghost task).';
    }

    if (!this.managedAgents.has(issue.assignedAgent.toLowerCase())) {
      return null;
    }

    const sessionCheck = this.isAgentSessionActive(issue.assignedAgent, sessions);
    if (!sessionCheck.active) {
      return sessionCheck.reason ?? 'Agent session is inactive.';
    }

    if (issue.targetFiles && issue.targetFiles.length > 0) {
      const hasAnyLock = issue.targetFiles.some(f => {
        const lockHolder = lockedFiles.get(normalizePath(f));
        return lockHolder?.toLowerCase() === issue.assignedAgent?.toLowerCase();
      });
      if (!hasAnyLock) {
        return `Assigned agent [${issue.assignedAgent}] holds zero active file locks for target files.`;
      }
    }

    return null;
  }

  public scanAndReclaim(
    issues: ReclaimCandidate[],
    lockedFiles: Map<string, string> = new Map(),
    sessions: AgentSessionSummary[] = []
  ): { reclaimed: ReclaimResult[]; updatedIssues: ReclaimCandidate[] } {
    const reclaimed: ReclaimResult[] = [];
    const updatedIssues: ReclaimCandidate[] = [];

    const normalizedLocks = new Map<string, string>();
    for (const [k, v] of lockedFiles.entries()) {
      normalizedLocks.set(normalizePath(k), v);
    }

    for (const issue of issues) {
      const stallReason = this.evaluateIssueStall(issue, normalizedLocks, sessions);
      if (stallReason) {
        const copy: ReclaimCandidate = {
          ...issue,
          status: 'ready',
          assignedAgent: undefined,
          assignedIde: undefined,
          labels: issue.labels ? [...issue.labels.filter(l => !l.startsWith('status:')), 'status:ready'] : ['status:ready']
        };
        reclaimed.push({
          issueNumber: issue.number,
          title: issue.title,
          previousAgent: issue.assignedAgent,
          reason: stallReason,
          reclaimedAt: new Date().toISOString()
        });
        updatedIssues.push(copy);
      } else {
        updatedIssues.push(issue);
      }
    }

    return { reclaimed, updatedIssues };
  }
}
