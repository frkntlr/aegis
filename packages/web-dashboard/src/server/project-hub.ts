import * as fs from 'node:fs';
import * as path from 'node:path';

import { WorktreeManager } from '@aegis/orchestrator';
import { GitHubProjectsAdapter, GitHubTokenResolver } from '@aegis/github-live';
import { SessionDetector } from './session-detector.js';
import { RealtimeMetricsService } from './realtime-metrics.js';
import { GitHubKanbanService } from './github-kanban.js';
import { ProjectContext, ProjectSummary, FocusResult } from './project-types.js';

export class ProjectHub {
  private contexts: Map<string, ProjectContext> = new Map();
  private activeProjectId: string;
  private defaultRepoRoot: string;
  private owner: string;
  private offline: boolean;
  private persistLocks: boolean;

  constructor(defaultRepoRoot?: string, offline?: boolean, persistLocks?: boolean) {
    this.defaultRepoRoot = defaultRepoRoot ?? process.cwd();
    this.offline = offline ?? false;
    this.persistLocks = persistLocks ?? true;
    const auth = GitHubTokenResolver.resolve();
    this.owner = auth.owner || 'frkntlr';
    const repoName = auth.repo || path.basename(this.defaultRepoRoot);
    const projId = `${this.owner}/${repoName.toLowerCase()}`;
    const projTitle = repoName.toLowerCase() === 'aegis' ? 'Aegis Autonomous Engine' : repoName;
    const initCtx = this.createContext(projId, projTitle, 4, this.defaultRepoRoot, true);
    this.contexts.set(initCtx.id, initCtx);
    this.activeProjectId = initCtx.id;
  }

  private createContext(id: string, name: string, projectNumber: number, localPath: string, isBound: boolean): ProjectContext {
    const wtManager = new WorktreeManager({ repoRoot: localPath, persistLocks: this.persistLocks });
    const detector = new SessionDetector(localPath, wtManager);
    const kanban = new GitHubKanbanService({ repoRoot: localPath, projectNumber, offline: this.offline });
    const metrics = new RealtimeMetricsService({ repoRoot: localPath, githubService: kanban });

    return {
      id,
      name,
      projectNumber,
      repoOwner: this.owner,
      repoName: id.split('/')[1] || id,
      localPath,
      isLocalBound: isBound,
      lastFocusedAt: new Date().toISOString(),
      wtManager,
      detector,
      metrics,
      kanban
    };
  }

  public findMatchingLocalPath(hint: string): string | undefined {
    const parent = path.resolve(this.defaultRepoRoot, '..');
    if (!fs.existsSync(parent)) return undefined;

    const cleanHint = hint.toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
      const entries = fs.readdirSync(parent, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const cleanName = ent.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanName === cleanHint) return path.join(parent, ent.name);
      }
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const cleanName = ent.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanName.includes(cleanHint) || cleanHint.includes(cleanName)) {
          return path.join(parent, ent.name);
        }
      }
    } catch {
      // Ignore read errors
    }
    return undefined;
  }

  public async discoverProjects(): Promise<ProjectSummary[]> {
    const isTest = process.env.NODE_ENV === 'test' ||
      process.env.npm_lifecycle_event === 'test' ||
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      process.execArgv.includes('--test');
    if (this.offline || isTest) return this.listProjects();

    const auth = GitHubTokenResolver.resolve();
    if (!auth.hasCredentials || !auth.token) return this.listProjects();

    try {
      const adapter = new GitHubProjectsAdapter({ token: auth.token, owner: this.owner });
      const projects = await adapter.listProjects(this.owner);

      for (const p of projects) {
        const id = `${this.owner}/${p.title.split(/[\s—-]+/)[0].toLowerCase()}`;
        if (!this.contexts.has(id)) {
          const matched = this.findMatchingLocalPath(p.title);
          const localPath = matched || path.resolve(this.defaultRepoRoot, '..', p.title);
          const isBound = Boolean(matched && fs.existsSync(matched));
          const ctx = this.createContext(id, p.title, p.number, localPath, isBound);
          this.contexts.set(id, ctx);
        }
      }
    } catch {
      // Offline fallback
    }
    return this.listProjects();
  }

  public handleFocus(workspacePath: string): FocusResult {
    const resolved = path.resolve(workspacePath);
    const norm = resolved.replace(/\\/g, '/');
    let matchedCtx: ProjectContext | undefined;

    for (const ctx of this.contexts.values()) {
      const ctxNorm = path.resolve(ctx.localPath).replace(/\\/g, '/');
      if (norm === ctxNorm || norm.startsWith(ctxNorm + '/')) {
        matchedCtx = ctx;
        break;
      }
    }

    if (!matchedCtx) {
      if (!fs.existsSync(resolved) || !fs.existsSync(path.join(resolved, '.git'))) {
        throw new Error(`Geçersiz proje kökü: '${workspacePath}' geçerli bir git deposu değil (.git bulunamadı).`);
      }
      const baseName = path.basename(workspacePath);
      const newId = `${this.owner}/${baseName.toLowerCase()}`;
      matchedCtx = this.createContext(newId, baseName, 4, workspacePath, true);
      this.contexts.set(newId, matchedCtx);
    }

    const prev = this.activeProjectId;
    const switched = prev !== matchedCtx.id;
    this.activeProjectId = matchedCtx.id;
    matchedCtx.lastFocusedAt = new Date().toISOString();

    return {
      switched,
      previousProject: prev,
      activeProject: this.toSummary(matchedCtx),
      message: switched ? `Bağlam otomatik olarak '${matchedCtx.name}' projesine aktarıldı.` : 'Mevcut bağlam korundu.'
    };
  }

  public switchProject(projectId: string): FocusResult {
    const target = this.contexts.get(projectId);
    if (!target) throw new Error(`Project '${projectId}' not found in registered contexts.`);
    const prev = this.activeProjectId;
    this.activeProjectId = projectId;
    target.lastFocusedAt = new Date().toISOString();

    return {
      switched: prev !== projectId,
      previousProject: prev,
      activeProject: this.toSummary(target),
      message: `Proje '${target.name}' olarak değiştirildi.`
    };
  }

  public getActiveContext(): ProjectContext {
    return this.contexts.get(this.activeProjectId) || Array.from(this.contexts.values())[0];
  }

  public getContext(projectId: string): ProjectContext | undefined {
    return this.contexts.get(projectId);
  }

  public listProjects(): ProjectSummary[] {
    return Array.from(this.contexts.values()).map(ctx => this.toSummary(ctx));
  }

  private toSummary(ctx: ProjectContext): ProjectSummary {
    return {
      id: ctx.id,
      name: ctx.name,
      projectNumber: ctx.projectNumber,
      repoOwner: ctx.repoOwner,
      repoName: ctx.repoName,
      localPath: ctx.localPath,
      isLocalBound: ctx.isLocalBound,
      isFocused: ctx.id === this.activeProjectId,
      lastFocusedAt: ctx.lastFocusedAt
    };
  }
}
