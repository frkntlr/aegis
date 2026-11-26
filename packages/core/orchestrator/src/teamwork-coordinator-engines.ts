/**
 * @file teamwork-coordinator-engines.ts
 * Lazy engine initialization and accessor base class for TeamworkCoordinator.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { debugLogIgnored, resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeManager } from './worktree-manager.js';
import { RoleClassifier } from './role-classifier.js';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
import { TeamworkCompactEngine } from './teamwork-compact.js';
import { TeamworkMesh } from './teamwork-mesh.js';
import { TeamworkDeliberationEngine } from './teamwork-deliberation.js';
import { TeamworkReflectionEngine } from './teamwork-reflection.js';
import { ProjectBootstrapEngine, type BootstrapOptions, type BootstrapResult } from './project-bootstrap.js';

export interface TeamworkCoordinatorOptions {
  bootstrap?: boolean;
  repoRoot?: string;
  worktreeManager?: WorktreeManager;
  roleClassifier?: RoleClassifier;
  groundingEngine?: TeamworkGroundingEngine;
  semanticAnalyzer?: FastSemanticAnalyzer;
  compactEngine?: TeamworkCompactEngine;
  mesh?: TeamworkMesh;
  deliberationEngine?: TeamworkDeliberationEngine;
  reflectionEngine?: TeamworkReflectionEngine;
}

export class TeamworkCoordinatorEngines {
  protected repoRoot: string;
  private _worktreeManager?: WorktreeManager;
  private _roleClassifier?: RoleClassifier;
  private _groundingEngine?: TeamworkGroundingEngine;
  private _semanticAnalyzer?: FastSemanticAnalyzer;
  private _compactEngine?: TeamworkCompactEngine;
  private _mesh?: TeamworkMesh;
  private _deliberationEngine?: TeamworkDeliberationEngine;
  private _reflectionEngine?: TeamworkReflectionEngine;
  protected bootstrapped = false;

  constructor(repoRootOrOptions?: string | TeamworkCoordinatorOptions) {
    if (typeof repoRootOrOptions === 'object' && repoRootOrOptions !== null) {
      this.repoRoot = resolveSafeRepoRoot(repoRootOrOptions.repoRoot);
      this._worktreeManager = repoRootOrOptions.worktreeManager;
      this._roleClassifier = repoRootOrOptions.roleClassifier;
      this._groundingEngine = repoRootOrOptions.groundingEngine;
      this._semanticAnalyzer = repoRootOrOptions.semanticAnalyzer;
      this._compactEngine = repoRootOrOptions.compactEngine;
      this._mesh = repoRootOrOptions.mesh;
      this._deliberationEngine = repoRootOrOptions.deliberationEngine;
      this._reflectionEngine = repoRootOrOptions.reflectionEngine;
    } else {
      this.repoRoot = resolveSafeRepoRoot(repoRootOrOptions);
    }
    if (typeof repoRootOrOptions !== 'object' || repoRootOrOptions?.bootstrap !== false) {
      this.ensureBootstrap();
    }
  }

  public ensureBootstrap(): void {
    if (this.bootstrapped) return;
    try {
      this.bootstrap();
    } catch (err: unknown) {
      debugLogIgnored('TeamworkCoordinator:ensureBootstrap', err);
    }
  }

  public bootstrap(options?: BootstrapOptions): BootstrapResult {
    const result = ProjectBootstrapEngine.bootstrap(this.repoRoot, options);
    this.bootstrapped = true;
    return result;
  }

  public get repoRootPath(): string { return this.repoRoot; }
  public get worktreeManager(): WorktreeManager {
    return this._worktreeManager ??= new WorktreeManager({ repoRoot: this.repoRoot, persistLocks: true });
  }
  public get roleClassifier(): RoleClassifier { return this._roleClassifier ??= new RoleClassifier(); }
  public get groundingEngine(): TeamworkGroundingEngine { return this._groundingEngine ??= new TeamworkGroundingEngine(this.repoRoot); }
  public get semanticAnalyzer(): FastSemanticAnalyzer { return this._semanticAnalyzer ??= new FastSemanticAnalyzer(this.repoRoot); }
  public get compactEngine(): TeamworkCompactEngine { return this._compactEngine ??= new TeamworkCompactEngine(this.repoRoot); }
  public get mesh(): TeamworkMesh { return this._mesh ??= new TeamworkMesh(this.repoRoot); }
  public get deliberationEngine(): TeamworkDeliberationEngine { return this._deliberationEngine ??= new TeamworkDeliberationEngine(this.repoRoot); }
  public get reflectionEngine(): TeamworkReflectionEngine { return this._reflectionEngine ??= new TeamworkReflectionEngine(this.repoRoot, this.mesh); }

  public getRepoRoot(): string { return this.repoRoot; }
  public getWorktreeManager(): WorktreeManager { return this.worktreeManager; }
  public getRoleClassifier(): RoleClassifier { return this.roleClassifier; }
  public getGroundingEngine(): TeamworkGroundingEngine { return this.groundingEngine; }
  public getSemanticAnalyzer(): FastSemanticAnalyzer { return this.semanticAnalyzer; }
  public getCompactEngine(): TeamworkCompactEngine { return this.compactEngine; }
  public getDeliberationEngine(): TeamworkDeliberationEngine { return this.deliberationEngine; }
  public getReflectionEngine(): TeamworkReflectionEngine { return this.reflectionEngine; }
  public getMesh(): TeamworkMesh { return this.mesh; }
}
