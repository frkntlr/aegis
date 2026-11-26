import type { TaskInboxData, TaskInboxItem } from './task-inbox-types.js';

export function isTaskDependenciesSatisfied(task: TaskInboxItem, allTasks: TaskInboxItem[]): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  const isDiagnosticRole = task.role.includes('qa') || task.title.toLowerCase().includes('triage') || task.title.toLowerCase().includes('remediation');
  return task.dependsOn.every(dep => {
    const depLower = dep.toLowerCase();
    const candidates = allTasks.filter(other =>
      other.issueNumber !== task.issueNumber && (
        String(other.issueNumber) === dep ||
        String(other.id) === dep ||
        (other.trackId && other.trackId.toLowerCase().includes(depLower)) ||
        other.role.toLowerCase().includes(depLower) ||
        other.title.toLowerCase().includes(depLower)
      )
    );
    if (candidates.length === 0) return true;
    const upstream = candidates.filter(c =>
      task.phase !== undefined && c.phase !== undefined ? c.phase < task.phase : true
    );
    const pool = upstream.length > 0 ? upstream : candidates;
    const sameBatch = pool.filter(c => Math.abs(c.issueNumber - task.issueNumber) < 50);
    if (sameBatch.length > 0) {
      return sameBatch.every(c => c.status === 'done' || (isDiagnosticRole && c.status === 'blocked'));
    }
    const parent = pool.reduce((best, curr) =>
      Math.abs(curr.issueNumber - task.issueNumber) < Math.abs(best.issueNumber - task.issueNumber) ? curr : best
    );
    return parent.status === 'done' || (isDiagnosticRole && parent.status === 'blocked');
  });
}

export function reconcileBlockedTasks(
  data: TaskInboxData,
  writeFn: (d: TaskInboxData, baseDir?: string) => void,
  baseDir?: string
): void {
  let reconciled = false;
  for (const t of data.tasks) {
    if (t.status === 'blocked' && t.dependsOn?.length && isTaskDependenciesSatisfied(t, data.tasks)) {
      t.status = 'pending';
      reconciled = true;
    }
  }
  if (reconciled) writeFn(data, baseDir);
}

function hasRoleMismatch(t: string, q: string): boolean {
  const roles = ['solver', 'qa', 'ui', 'doc'];
  return roles.some(r1 => t.includes(r1) && roles.some(r2 => r1 !== r2 && q.includes(r2)));
}

const ROLE_ALIAS_GROUPS: ReadonlyArray<{ key: string; extras: readonly string[] }> = [
  { key: 'solver', extras: ['issue', 'issue-solver'] },
  { key: 'qa', extras: ['audit'] },
  { key: 'ui', extras: [] },
  { key: 'doc', extras: ['wiki'] }
];

function matchesIdentifier(cleanQ: string, issueNumber?: number, trackId?: string): boolean {
  if (trackId && trackId.toLowerCase() === cleanQ) return true;
  if (issueNumber === undefined) return false;
  return String(issueNumber) === cleanQ || `#${issueNumber}` === cleanQ;
}

function matchesBracketLabel(cleanT: string, cleanQ: string): boolean | null {
  const qBracket = cleanQ.match(/\[(.*?)\]/);
  const tBracket = cleanT.match(/\[(.*?)\]/);
  if (qBracket) {
    const qLabel = qBracket[1].trim();
    return tBracket ? qLabel === tBracket[1].trim() : cleanT.includes(qLabel);
  }
  if (tBracket) {
    const tLabel = tBracket[1].trim();
    if (cleanQ === tLabel || cleanQ.split(/[\s\-_]+/).includes(tLabel)) return true;
  }
  return null;
}

function matchesGenericRole(cleanT: string, cleanQ: string): boolean {
  return ROLE_ALIAS_GROUPS.some(({ key, extras }) => {
    if (!cleanT.includes(key)) return false;
    const aliases = [key, `${key}-specialist`, `${key}-hunter`, `${key}-architect`, ...extras];
    return aliases.includes(cleanQ);
  });
}

export function matchesTaskRole(taskRole: string, roleQuery: string, issueNumber?: number, trackId?: string): boolean {
  const cleanQ = roleQuery.toLowerCase().trim().replace(/^@/, '');
  const cleanT = taskRole.toLowerCase().trim().replace(/^@/, '');
  if (matchesIdentifier(cleanQ, issueNumber, trackId)) return true;
  if (hasRoleMismatch(cleanT, cleanQ)) return false;
  if (cleanT === cleanQ) return true;

  const bracketMatch = matchesBracketLabel(cleanT, cleanQ);
  if (bracketMatch !== null) return bracketMatch;
  if (cleanT.startsWith(cleanQ) || cleanQ.startsWith(cleanT)) return true;
  return matchesGenericRole(cleanT, cleanQ);
}
