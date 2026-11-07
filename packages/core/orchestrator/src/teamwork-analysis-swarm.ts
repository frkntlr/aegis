/**
 * @file teamwork-analysis-swarm.ts
 * Collaborative Concurrent Analysis Swarm and Executive Synthesizer.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { resolveSafeRepoRoot } from '@aegis/shared';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
import { TeamworkAnalysisMesh } from './teamwork-analysis-mesh.js';
import {
  AstStructuralLens,
  TriageHunterLens,
  RelationalMapperLens,
  GroundingMemoryLens
} from './teamwork-analysis-lenses.js';
import type {
  AnalysisSwarmReport,
  AnalysisSwarmOptions,
  AnalysisInsight,
  LensExecutionResult
} from './teamwork-analysis-types.js';

export class TeamworkAnalysisSwarm {
  private repoRoot: string;
  private mesh: TeamworkAnalysisMesh;
  private semanticAnalyzer: FastSemanticAnalyzer;

  constructor(repoRoot?: string, mesh?: TeamworkAnalysisMesh) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.mesh = mesh ?? new TeamworkAnalysisMesh(this.repoRoot, true);
    this.semanticAnalyzer = new FastSemanticAnalyzer(this.repoRoot);
  }

  public getSharedMesh(): TeamworkAnalysisMesh {
    return this.mesh;
  }

  public async runAnalysisSwarm(
    objective: string,
    explicitFiles: string[] = [],
    options?: AnalysisSwarmOptions
  ): Promise<AnalysisSwarmReport> {
    const start = Date.now();
    const swarmId = `swarm-${Date.now().toString(36)}`;
    this.mesh.initSwarm(swarmId, objective);

    const inputFiles = options?.files && options.files.length > 0 ? options.files : explicitFiles;
    const files = inputFiles.length > 0 ? inputFiles : this.semanticAnalyzer.analyze(objective).targetFiles;
    const lensResults = await this.executeParallelLenses(objective, files);

    const allInsights = lensResults.flatMap(r => r.insights);
    this.mesh.batchPost(allInsights);

    return this.buildSwarmReport(swarmId, objective, Date.now() - start, allInsights);
  }

  private async executeParallelLenses(objective: string, files: string[]): Promise<LensExecutionResult[]> {
    return Promise.all([
      AstStructuralLens.execute(this.repoRoot, files),
      TriageHunterLens.execute(this.repoRoot, files),
      RelationalMapperLens.execute(this.repoRoot, files),
      GroundingMemoryLens.execute(this.repoRoot, objective)
    ]);
  }

  private buildSwarmReport(
    swarmId: string,
    objective: string,
    durationMs: number,
    insights: AnalysisInsight[]
  ): AnalysisSwarmReport {
    const criticalRisks = insights.filter(i => i.severity === 'critical' || i.severity === 'high');
    const hotspots = this.mesh.getHotspots();
    const actions = this.extractRecommendedActions(insights);
    const summary = `Swarm completed in ${durationMs}ms across 4 concurrent lenses with ${insights.length} insight(s).`;

    return {
      swarmId,
      objective,
      durationMs,
      totalInsights: insights.length,
      criticalRisks,
      architecturalHotspots: hotspots,
      recommendedActions: actions,
      executiveSummary: summary,
      insights
    };
  }

  private extractRecommendedActions(insights: AnalysisInsight[]): string[] {
    const actions: string[] = [];
    for (const item of insights) {
      if (item.actionableStep && !actions.includes(item.actionableStep)) {
        actions.push(item.actionableStep);
      }
    }
    if (actions.length === 0) {
      actions.push('Proceed directly to autonomous implementation via `aegis tw`.');
    }
    return actions.slice(0, 5);
  }

  public formatExecutiveMatrix(report: AnalysisSwarmReport): string {
    const lines = [
      `### ⚡ Aegis Collaborative Analysis Swarm Matrix [${report.swarmId}]`,
      `**Objective**: ${report.objective}`,
      `**Duration**: ${report.durationMs}ms (Parallel 4-Lens Swarm) | **Insights**: ${report.totalInsights}`,
      '',
      '| Lens / Rol | Kategori | Önem | Hedef | Teşhis & Eylem |',
      '| :--- | :--- | :---: | :--- | :--- |'
    ];

    for (const item of report.insights.slice(0, 8)) {
      const sevIcon = item.severity === 'critical' ? '🔴 KRİTİK' : item.severity === 'high' ? '🟠 YÜKSEK' : '🟢 BİLGİ';
      lines.push(`| \`${item.lens}\` (@${item.agent}) | ${item.category} | ${sevIcon} | \`${item.target}\` | ${item.finding} |`);
    }

    if (report.recommendedActions.length > 0) {
      lines.push('\n**🚀 Öncelikli Eylem Planı (Actionable Next Steps):**');
      report.recommendedActions.forEach((act, idx) => {
        lines.push(`${idx + 1}. ${act}`);
      });
    }

    return lines.join('\n');
  }
}
