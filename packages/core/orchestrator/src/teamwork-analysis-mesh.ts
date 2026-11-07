/**
 * @file teamwork-analysis-mesh.ts
 * Shared Working Memory Mesh & Blackboard for concurrent analysis swarms.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import type {
  AnalysisInsight,
  AnalysisMeshFilter,
  AnalysisMeshState,
  AnalysisLens
} from './teamwork-analysis-types.js';

export class TeamworkAnalysisMesh {
  private repoRoot: string;
  private state: AnalysisMeshState;
  private persist: boolean;

  constructor(repoRoot?: string, persist = true) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.persist = persist;
    this.state = this.loadOrInitState();
  }

  private getMeshFilePath(): string {
    return path.join(this.repoRoot, '.aegis', 'analysis-mesh.json');
  }

  private loadOrInitState(): AnalysisMeshState {
    const filePath = this.getMeshFilePath();
    if (this.persist && fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw) as AnalysisMeshState;
      } catch {
        return this.createDefaultState();
      }
    }
    return this.createDefaultState();
  }

  private createDefaultState(objective = 'Codebase Analysis'): AnalysisMeshState {
    return {
      version: '1.0.0',
      swarmId: `swarm-${Date.now().toString(36)}`,
      objective,
      insights: {},
      hotspots: [],
      lastUpdated: new Date().toISOString()
    };
  }

  public initSwarm(swarmId: string, objective: string): void {
    this.state = {
      version: '1.0.0',
      swarmId,
      objective,
      insights: {},
      hotspots: [],
      lastUpdated: new Date().toISOString()
    };
    if (this.persist) this.saveState();
  }

  public postInsight(data: Omit<AnalysisInsight, 'id' | 'timestamp'>): AnalysisInsight {
    if (this.persist) this.reloadLatest();
    const id = `ins-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const insight: AnalysisInsight = {
      ...data,
      id,
      timestamp: new Date().toISOString()
    };
    this.state.insights[id] = insight;
    this.updateHotspot(data.target);
    this.state.lastUpdated = insight.timestamp;
    if (this.persist) this.saveState();
    return insight;
  }

  private reloadLatest(): void {
    const filePath = this.getMeshFilePath();
    if (!fs.existsSync(filePath)) return;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const loaded = JSON.parse(raw) as AnalysisMeshState;
      if (loaded && loaded.insights) {
        this.state.insights = { ...loaded.insights, ...this.state.insights };
        this.state.hotspots = Array.from(new Set([...loaded.hotspots, ...this.state.hotspots]));
        this.state.objective = loaded.objective || this.state.objective;
        this.state.swarmId = loaded.swarmId || this.state.swarmId;
      }
    } catch { /* ignore parse error */ }
  }

  public batchPost(list: Array<Omit<AnalysisInsight, 'id' | 'timestamp'>>): AnalysisInsight[] {
    const result: AnalysisInsight[] = [];
    for (const item of list) {
      result.push(this.postInsight(item));
    }
    return result;
  }

  private updateHotspot(target: string): void {
    if (!target || target === 'general') return;
    if (!this.state.hotspots.includes(target)) {
      this.state.hotspots.push(target);
    }
  }

  public query(filter?: AnalysisMeshFilter): AnalysisInsight[] {
    if (this.persist) this.reloadLatest();
    const all = Object.values(this.state.insights);
    if (!filter) return all;

    return all.filter(item => {
      if (filter.lens && item.lens !== filter.lens) return false;
      if (filter.severity && item.severity !== filter.severity) return false;
      if (filter.category && item.category !== filter.category) return false;
      if (filter.target && !item.target.toLowerCase().includes(filter.target.toLowerCase())) return false;
      return true;
    });
  }

  public getInsightsByLens(lens: AnalysisLens): AnalysisInsight[] {
    return this.query({ lens });
  }

  public getHotspots(): string[] {
    if (this.persist) this.reloadLatest();
    return [...this.state.hotspots];
  }

  public getMeshState(): AnalysisMeshState {
    if (this.persist) this.reloadLatest();
    return { ...this.state };
  }

  public clear(): void {
    this.state = this.createDefaultState();
    if (this.persist) {
      const filePath = this.getMeshFilePath();
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
  }

  public saveState(): void {
    try {
      const aegisDir = path.join(this.repoRoot, '.aegis');
      if (!fs.existsSync(aegisDir)) fs.mkdirSync(aegisDir, { recursive: true });
      const filePath = this.getMeshFilePath();
      const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      try {
        fs.renameSync(tmp, filePath);
      } catch {
        fs.copyFileSync(tmp, filePath);
        try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      }
    } catch {
      /* ignore file system errors in restricted test environments */
    }
  }
}
