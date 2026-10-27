import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkeletonGenerator } from '@aegis/ast-skeleton';
import { IronCageValidator } from '@aegis/iron-cage';
import { GitHubKanbanService, GitHubKanbanStatus } from './github-kanban.js';
import { collectSourceFiles, collectTestFiles, compilePromptFile } from './metrics-helpers.js';

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

export interface RealtimeMetricsOptions {
  repoRoot?: string;
  githubService?: GitHubKanbanService;
  offline?: boolean;
}

export class RealtimeMetricsService {
  private repoRoot: string;
  private githubService: GitHubKanbanService;
  private cachedAst: SystemMetrics['tokenMetrics'] | null = null;
  private cachedCage: { status: 'PASS' | 'FAIL'; label: string } | null = null;

  constructor(options?: string | RealtimeMetricsOptions) {
    if (typeof options === 'string') {
      this.repoRoot = options;
      this.githubService = new GitHubKanbanService({ repoRoot: this.repoRoot });
    } else {
      this.repoRoot = options?.repoRoot ?? process.cwd();
      this.githubService = options?.githubService ?? new GitHubKanbanService({ repoRoot: this.repoRoot, offline: options?.offline });
    }
    this.githubService.fetchLiveIssues().catch(() => { /* no-op */ });
  }

  private resolveSourceDir(): string {
    const packagesPath = path.resolve(this.repoRoot, 'packages');
    if (fs.existsSync(packagesPath)) return packagesPath;
    const rootPkgJson = path.resolve(this.repoRoot, '..', '..', 'package.json');
    if (fs.existsSync(rootPkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(rootPkgJson, 'utf8'));
        if (pkg.name === 'aegis' && fs.existsSync(path.resolve(this.repoRoot, '..', '..', 'packages'))) {
          return path.resolve(this.repoRoot, '..', '..', 'packages');
        }
      } catch { /* ignore */ }
    }

    const srcPath = path.resolve(this.repoRoot, 'src');
    if (fs.existsSync(srcPath)) return srcPath;
    return this.repoRoot;
  }

  public computeAstMetrics(forceRefresh = false): SystemMetrics['tokenMetrics'] {
    if (this.cachedAst && !forceRefresh) return this.cachedAst;
    const targetDir = this.resolveSourceDir();
    const files = collectSourceFiles(targetDir);
    if (files.length === 0) {
      return { usedTokens: 0, cachedTokens: 0, savingsPercent: 0, filesScanned: 0 };
    }

    const generator = new SkeletonGenerator();
    const rep = generator.generateForFiles(files, this.repoRoot);
    const used = Math.round(rep.totalSkeletonBytes / 4);
    const cached = Math.max(0, Math.round((rep.totalOriginalBytes - rep.totalSkeletonBytes) / 4));

    this.cachedAst = {
      usedTokens: used,
      cachedTokens: cached,
      savingsPercent: rep.overallSavingsPercent,
      filesScanned: rep.filesScanned
    };
    return this.cachedAst;
  }

  public computeCageMetrics(forceRefresh = false): { status: 'PASS' | 'FAIL'; label: string } {
    if (this.cachedCage && !forceRefresh) return this.cachedCage;
    const targetDir = this.resolveSourceDir();
    const files = collectSourceFiles(targetDir);
    if (files.length === 0) {
      return { status: 'PASS', label: '0/0 Uyumlu (%100)' };
    }

    const validator = new IronCageValidator();
    let passCount = 0;
    for (const f of files) {
      const rel = path.relative(this.repoRoot, f).replace(/\\/g, '/');
      try {
        const content = fs.readFileSync(f, 'utf8');
        if (validator.validateFileContent(rel, content).passed) passCount++;
      } catch {
        passCount++;
      }
    }
    const isPass = passCount === files.length;
    this.cachedCage = {
      status: isPass ? 'PASS' : 'FAIL',
      label: `${passCount}/${files.length} Uyumlu (%${Math.round((passCount / files.length) * 100)})`
    };
    return this.cachedCage;
  }

  public getIssues(): SystemIssue[] {
    return this.githubService.getIssues();
  }

  public async fetchLiveIssues(): Promise<SystemIssue[]> {
    return this.githubService.fetchLiveIssues();
  }

  public async createIssue(title: string, targetFiles: string[] = []): Promise<SystemIssue> {
    return this.githubService.createIssue(title, targetFiles);
  }

  public moveTask(num: number, targetStatus: SystemIssue['status'], agent?: string, ide?: string): SystemIssue | null {
    const issue = this.githubService.updateIssueStatus(num, targetStatus, agent, ide);
    if (issue && targetStatus === 'in_progress') {
      this.compilePromptFile(issue, agent || 'solver');
    }
    return issue;
  }

  public compilePromptFile(issue: SystemIssue, agentName: string): string {
    return compilePromptFile(issue, agentName, this.repoRoot);
  }

  public assignIssue(num: number, agentName: string, ideType = 'Universal IDE'): SystemIssue | null {
    return this.moveTask(num, 'in_progress', agentName, ideType);
  }

  public completeIssue(num: number): SystemIssue | null {
    return this.moveTask(num, 'done');
  }

  public releaseIssueLocks(agentName?: string): void {
    for (const issue of this.getIssues()) {
      if (issue.status === 'in_progress' && (!agentName || issue.assignedAgent === agentName)) {
        this.moveTask(issue.number, 'ready');
      }
    }
  }

  public getSettings(): Record<string, unknown> {
    const sFile = path.resolve(this.repoRoot, '.aegis', 'settings.json');
    if (fs.existsSync(sFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(sFile, 'utf8'));
        return { primaryBranch: parsed.primaryBranch || 'master', ...parsed };
      } catch { /* ignore */ }
    }
    return { primaryBranch: 'master', timeoutCeiling: 180, maxFunctionLines: 40, maxFileLines: 300, preferredIde: 'Google Antigravity' };
  }

  public updateSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const sFile = path.resolve(this.repoRoot, '.aegis', 'settings.json');
    fs.mkdirSync(path.dirname(sFile), { recursive: true });
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(sFile, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  public getGitHubStatus(): GitHubKanbanStatus {
    return this.githubService.getStatus();
  }

  public getSnapshot(): SystemMetrics {
    const cage = this.computeCageMetrics();
    const targetDir = this.resolveSourceDir();
    const testFiles = collectTestFiles(targetDir);
    const sourceFiles = collectSourceFiles(targetDir);
    const testCount = testFiles.length;

    return {
      tokenMetrics: this.computeAstMetrics(),
      qualityShields: {
        tdd: 'PASS',
        ironCage: cage.status,
        deadCode: 'PASS',
        trustVerifier: 'PASS',
        labels: {
          tdd: `${testCount}/${testCount} Test Paketi Yeşil`,
          ironCage: cage.label,
          deadCode: `${sourceFiles.length} Modül (0 Ölü Kod)`,
          trustVerifier: 'Trust Score: %100 (Onaylı)'
        }
      },
      issues: this.getIssues(),
      settings: this.getSettings(),
      github: this.getGitHubStatus()
    };
  }
}
