/**
 * @file teamwork-analysis-mesh.ts
 * Shared Working Memory Mesh & Blackboard for concurrent analysis swarms.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, readJsonSafe, resolveSafeRepoRoot } from '@aegis/shared';
import type {
  AnalysisInsight,
  AnalysisMeshFilter,
  AnalysisMeshState,
  AnalysisLens
} from './teamwork-analysis-types.js';

function getAnalysisMeshPath(repoRoot: string): string {
  return path.join(repoRoot, '.aegis', 'analysis-mesh.json');
}

function createDefaultAnalysisState(objective = 'Codebase Analysis'): AnalysisMeshState {
  return {
    version: '1.0.0',
    swarmId: `swarm-${Date.now().toString(36)}`,
    objective,
    insights: {},
    hotspots: [],
    lastUpdated: new Date().toISOString()
  };
}

function loadOrInitAnalysisState(repoRoot: string, persist: boolean): AnalysisMeshState {
  const filePath = getAnalysisMeshPath(repoRoot);
  if (persist && fs.existsSync(filePath)) {
    try {
      return readJsonSafe<AnalysisMeshState>(filePath);
    } catch (err: unknown) {
      debugLogIgnored('TeamworkAnalysisMesh:loadOrInit', err);
      return createDefaultAnalysisState();
    }
  }
  return createDefaultAnalysisState();
}

function reloadLatestAnalysisState(repoRoot: string, state: AnalysisMeshState): void {
  const filePath = getAnalysisMeshPath(repoRoot);
  if (!fs.existsSync(filePath)) return;
  try {
    const loaded = readJsonSafe<AnalysisMeshState>(filePath);
    if (loaded && loaded.insights) {
      state.insights = { ...loaded.insights, ...state.insights };
      state.hotspots = Array.from(new Set([...loaded.hotspots, ...state.hotspots]));
      state.objective = loaded.objective || state.objective;
      state.swarmId = loaded.swarmId || state.swarmId;
    }
  } catch (err: unknown) { debugLogIgnored('TeamworkAnalysisMesh:reloadLatest', err); }
}

function updateAnalysisHotspot(state: AnalysisMeshState, target: string): void {
  if (!target || target === 'general') return;
  if (!state.hotspots.includes(target)) {
    state.hotspots.push(target);
  }
}

export class TeamworkAnalysisMesh {
  private repoRoot: string;
  private state: AnalysisMeshState;
  private persist: boolean;

  constructor(repoRoot?: string, persist = true) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.persist = persist;
    this.state = loadOrInitAnalysisState(this.repoRoot, this.persist);
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
    if (this.persist) reloadLatestAnalysisState(this.repoRoot, this.state);
    const id = `ins-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const insight: AnalysisInsight = {
      ...data,
      id,
      timestamp: new Date().toISOString()
    };
    this.state.insights[id] = insight;
    updateAnalysisHotspot(this.state, data.target);
    this.state.lastUpdated = insight.timestamp;
    if (this.persist) this.saveState();
    return insight;
  }

  public batchPost(list: Array<Omit<AnalysisInsight, 'id' | 'timestamp'>>): AnalysisInsight[] {
    const result: AnalysisInsight[] = [];
    for (const item of list) {
      result.push(this.postInsight(item));
    }
    return result;
  }

  public query(filter?: AnalysisMeshFilter): AnalysisInsight[] {
    if (this.persist) reloadLatestAnalysisState(this.repoRoot, this.state);
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
    if (this.persist) reloadLatestAnalysisState(this.repoRoot, this.state);
    return [...this.state.hotspots];
  }

  public getMeshState(): AnalysisMeshState {
    if (this.persist) reloadLatestAnalysisState(this.repoRoot, this.state);
    return { ...this.state };
  }

  public clear(): void {
    this.state = createDefaultAnalysisState();
    if (this.persist) {
      const filePath = getAnalysisMeshPath(this.repoRoot);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err: unknown) { debugLogIgnored('TeamworkAnalysisMesh:clear', err); }
      }
    }
  }

  public saveState(): void {
    let tmp = '';
    try {
      const aegisDir = path.join(this.repoRoot, '.aegis');
      if (!fs.existsSync(aegisDir)) fs.mkdirSync(aegisDir, { recursive: true });
      const filePath = getAnalysisMeshPath(this.repoRoot);
      tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      try {
        fs.renameSync(tmp, filePath);
      } catch (renameErr: unknown) {
        debugLogIgnored('TeamworkAnalysisMesh:renameTmp', renameErr);
        fs.copyFileSync(tmp, filePath);
      }
    } catch (err: unknown) {
      debugLogIgnored('TeamworkAnalysisMesh:saveState', err);
    } finally {
      try {
        if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
      } catch (cleanupErr: unknown) {
        debugLogIgnored('TeamworkAnalysisMesh:cleanupTmp', cleanupErr);
      }
    }
  }
}
