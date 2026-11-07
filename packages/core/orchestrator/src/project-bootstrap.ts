/**
 * @file project-bootstrap.ts
 * Automatic repo and workspace bootstrap engine for zero-configuration startup.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { cleanGitEnv, resolveSafeRepoRoot } from '@aegis/shared';

export interface BootstrapOptions {
  force?: boolean;
  projectName?: string;
  description?: string;
  defaultBranch?: string;
}

export interface BootstrapResult {
  repoRoot: string;
  initializedGit: boolean;
  createdGitignore: boolean;
  createdReadme: boolean;
  createdDocs: boolean;
  createdAegis: boolean;
  message: string;
}

function buildDefaultGitignore(): string {
  return [
    '# Node & Dependencies',
    'node_modules/',
    '.pnpm-store/',
    '',
    '# Production & Build outputs',
    'dist/',
    'build/',
    'out/',
    '',
    '# Aegis Orchestration & Mutex Locks',
    '.aegis/locks.json',
    '.aegis/cache/',
    '.cache/',
    '',
    '# Test Logs & Diagnostics',
    '*.log',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    '',
    '# Environment & Secrets',
    '.env',
    '.env.local',
    '.env.*.local',
    ''
  ].join('\n');
}

function buildDefaultReadme(projectName: string, description?: string): string {
  const desc = description ?? 'Autonomous multi-agent workspace orchestrated by Aegis.';
  return [
    `# ${projectName}`,
    '',
    `> ${desc}`,
    '',
    '[![Aegis](https://img.shields.io/badge/Aegis-Antigravity-blue)](https://github.com)',
    '[![Iron Cage](https://img.shields.io/badge/Demir_Kafes-Compliant-brightgreen)](https://github.com)',
    '[![Zero Any](https://img.shields.io/badge/Types-Strict_0_Any-green)](https://github.com)',
    '',
    '## 🏛️ Mimari & Living Architecture',
    '<!-- AEGIS_ARCHITECTURE_START -->',
    'This repository is governed by Aegis Iron Cage constitutional constraints (<300 lines/file, <40 lines/function, 0 any).',
    '<!-- AEGIS_ARCHITECTURE_END -->',
    '',
    '## 🚀 Hızlı Başlangıç (Quick Start)',
    '- `npm install`',
    '- `npm test`',
    '- `npm run aegis -- help`',
    ''
  ].join('\n');
}

function initGitRepo(repoRoot: string, branch = 'master'): boolean {
  try {
    execSync(`git init -b ${branch}`, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanGitEnv()
    });
    return true;
  } catch {
    try {
      execSync('git init', {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cleanGitEnv()
      });
      try {
        execSync(`git branch -M ${branch}`, {
          cwd: repoRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: cleanGitEnv()
        });
      } catch { /* branch rename can be skipped on empty git repo */ }
      return true;
    } catch {
      return false;
    }
  }
}

export class ProjectBootstrapEngine {
  private repoRoot: string;

  constructor(repoRoot?: string) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
  }

  public static isRepoInitialized(repoRoot: string): boolean {
    const root = resolveSafeRepoRoot(repoRoot);
    return fs.existsSync(path.join(root, '.git'));
  }

  public isRepoInitialized(repoRoot?: string): boolean {
    return ProjectBootstrapEngine.isRepoInitialized(repoRoot ?? this.repoRoot);
  }

  public static bootstrap(repoRoot: string, options?: BootstrapOptions): BootstrapResult {
    return new ProjectBootstrapEngine(repoRoot).bootstrap(options);
  }

  public bootstrap(optionsOrRoot?: BootstrapOptions | string, extraOptions?: BootstrapOptions): BootstrapResult {
    const root = typeof optionsOrRoot === 'string' ? resolveSafeRepoRoot(optionsOrRoot) : this.repoRoot;
    const opts = (typeof optionsOrRoot === 'object' ? optionsOrRoot : extraOptions) ?? {};

    const initializedGit = this.ensureGit(root, opts);
    const createdGitignore = this.ensureGitignore(root, opts);
    const createdReadme = this.ensureReadme(root, opts);
    const createdDocs = this.ensureDocs(root);
    const createdAegis = this.ensureAegis(root, opts);

    const message = `Workspace bootstrap completed at ${root} ` +
      `(git: ${initializedGit ? 'initialized' : 'skipped'}, ` +
      `gitignore: ${createdGitignore ? 'created' : 'skipped'}, ` +
      `readme: ${createdReadme ? 'created' : 'skipped'}, ` +
      `docs: ${createdDocs ? 'created' : 'skipped'}, ` +
      `aegis: ${createdAegis ? 'created' : 'skipped'}).`;

    return {
      repoRoot: root,
      initializedGit,
      createdGitignore,
      createdReadme,
      createdDocs,
      createdAegis,
      message
    };
  }

  private ensureGit(root: string, opts: BootstrapOptions): boolean {
    if (!ProjectBootstrapEngine.isRepoInitialized(root) || opts.force) {
      return initGitRepo(root, opts.defaultBranch ?? 'master');
    }
    return false;
  }

  private ensureGitignore(root: string, opts: BootstrapOptions): boolean {
    const gitignorePath = path.join(root, '.gitignore');
    if (!fs.existsSync(gitignorePath) || opts.force) {
      fs.writeFileSync(gitignorePath, buildDefaultGitignore(), 'utf8');
      return true;
    }
    return false;
  }

  private ensureReadme(root: string, opts: BootstrapOptions): boolean {
    const readmePath = path.join(root, 'README.md');
    if (!fs.existsSync(readmePath) || opts.force) {
      const projectName = opts.projectName || path.basename(root) || 'Aegis Project';
      fs.writeFileSync(readmePath, buildDefaultReadme(projectName, opts.description), 'utf8');
      return true;
    }
    return false;
  }

  private ensureDocs(root: string): boolean {
    const rfcDir = path.join(root, 'docs', 'rfc');
    if (!fs.existsSync(rfcDir)) {
      fs.mkdirSync(rfcDir, { recursive: true });
      return true;
    }
    return false;
  }

  private ensureAegis(root: string, opts: BootstrapOptions): boolean {
    const aegisDir = path.join(root, '.aegis');
    let created = false;
    if (!fs.existsSync(aegisDir)) {
      fs.mkdirSync(aegisDir, { recursive: true });
      created = true;
    }
    const inboxPath = path.join(aegisDir, 'task-inbox.json');
    if (!fs.existsSync(inboxPath) || opts.force) {
      fs.writeFileSync(inboxPath, '[]\n', 'utf8');
      created = true;
    }
    return created;
  }
}
