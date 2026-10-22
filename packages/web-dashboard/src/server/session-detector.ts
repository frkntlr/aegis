import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorktreeManager } from '@aegis/orchestrator';

export interface AgentSession {
  agentName: string;
  ideType: 'Google Antigravity' | 'Cursor AI' | 'VS Code' | 'Zed Editor' | 'Universal IDE';
  worktreePath: string;
  branch: string;
  status: 'active' | 'idle' | 'locked';
  lockedFiles: string[];
  lastHeartbeat: string;
}

export class SessionDetector {
  private repoRoot: string;
  private wtManager: WorktreeManager;

  constructor(repoRoot?: string, wtManager?: WorktreeManager) {
    this.repoRoot = repoRoot ?? process.cwd();
    this.wtManager = wtManager ?? new WorktreeManager({ repoRoot: this.repoRoot, persistLocks: true });
  }

  private detectIdeType(wtPath: string): AgentSession['ideType'] {
    if (fs.existsSync(path.join(wtPath, '.cursor')) || fs.existsSync(path.join(wtPath, '.cursorrules'))) {
      return 'Cursor AI';
    }
    if (fs.existsSync(path.join(wtPath, '.zed'))) {
      return 'Zed Editor';
    }
    if (fs.existsSync(path.join(wtPath, '.vscode'))) {
      return 'Google Antigravity';
    }
    return 'Universal IDE';
  }

  private readSessionFile(agentName: string, defaultIde: AgentSession['ideType']): {
    ideType: AgentSession['ideType'];
    lastHeartbeat: string;
  } {
    const sessionsDir = path.resolve(this.repoRoot, '.aegis', 'sessions');
    const sessionFile = path.resolve(sessionsDir, `${agentName}.json`);
    if (fs.existsSync(sessionFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        return {
          ideType: (parsed.ideType as AgentSession['ideType']) || defaultIde,
          lastHeartbeat: parsed.lastHeartbeat || new Date().toISOString()
        };
      } catch {
        // Fallback on corrupt file
      }
    }
    return { ideType: defaultIde, lastHeartbeat: new Date().toISOString() };
  }

  public detectSessions(): AgentSession[] {
    const list = this.wtManager.listWorktrees();
    const locks = this.wtManager.getLockedFiles();
    const sessions: AgentSession[] = [];

    for (const wt of list.worktrees) {
      const lockedFiles: string[] = [];
      for (const [file, lockedAgent] of locks.entries()) {
        if (lockedAgent === wt.agentName) {
          lockedFiles.push(file);
        }
      }

      const defaultIde = this.detectIdeType(wt.path);
      const meta = this.readSessionFile(wt.agentName, defaultIde);
      const status: AgentSession['status'] = lockedFiles.length > 0 ? 'locked' : (wt.agentName === 'alice' ? 'active' : 'idle');

      sessions.push({
        agentName: wt.agentName,
        ideType: meta.ideType,
        worktreePath: wt.path,
        branch: wt.branch,
        status,
        lockedFiles,
        lastHeartbeat: meta.lastHeartbeat
      });
    }

    return sessions;
  }

  public registerHeartbeat(agentName: string, ideType: AgentSession['ideType'] = 'Google Antigravity'): void {
    const sessionsDir = path.resolve(this.repoRoot, '.aegis', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionFile = path.resolve(sessionsDir, `${agentName}.json`);
    const data = {
      agentName,
      ideType,
      lastHeartbeat: new Date().toISOString()
    };
    fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2), 'utf8');
  }
}
