/**
 * @file teamwork-report-generator.ts
 * Real-time Ground-Truth Teamwork Report Generator for Aegis Antigravity.
 * Produces High-Signal Full Reports, Dense RTK Compact Reports & Structured JSON.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { TeamworkMesh } from './teamwork-mesh.js';
import {
  buildAdrDecisions,
  buildCompactReport,
  buildFullReport,
  buildRecommendations,
} from './teamwork-report-formatter.js';
import {
  aggregatePeerMetrics,
  calculateDuration,
  getGitInfo,
  scanDemirKafes,
} from './teamwork-report-metrics.js';
import type { GroundTruthFacts, TeamworkJsonReport } from './teamwork-report-types.js';

export * from './teamwork-report-types.js';
export * from './teamwork-report-formatter.js';

export class TeamworkReportGenerator {
  private repoRoot: string;
  private mesh: TeamworkMesh;

  constructor(repoRoot?: string, mesh?: TeamworkMesh) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.mesh = mesh ?? new TeamworkMesh(this.repoRoot);
  }

  public gatherFacts(planId?: string): GroundTruthFacts {
    const state = this.mesh.getMeshState();
    const effectivePlanId = planId ?? state.planId;
    const peers = Object.values(state.agents);
    const dur = calculateDuration(state.events);
    const git = getGitInfo(this.repoRoot);
    const agg = aggregatePeerMetrics(peers);
    const qualityGate = scanDemirKafes(this.repoRoot, agg.modifiedFiles);
    const adrs = buildAdrDecisions(state.activeWave, peers.length);
    const recommendations = buildRecommendations(agg.counts, qualityGate);

    return {
      planId: effectivePlanId,
      objective: state.objective,
      activeWave: state.activeWave,
      lastUpdated: state.lastUpdated,
      startedAt: dur.startedAt,
      durationMs: dur.durationMs,
      formattedDuration: dur.formatted,
      concurrencyFactor: Math.max(1, peers.length),
      git,
      peers,
      subagentCounts: agg.counts,
      modifiedFiles: agg.modifiedFiles,
      publishedContracts: agg.publishedContracts,
      qualityGate,
      adrs,
      recommendations,
    };
  }

  public generateFullReport(planId?: string): string {
    return buildFullReport(this.gatherFacts(planId));
  }

  public generateCompactReport(planId?: string): string {
    return buildCompactReport(this.gatherFacts(planId));
  }

  public generateJsonReport(planId?: string): TeamworkJsonReport {
    const f = this.gatherFacts(planId);
    return {
      planId: f.planId,
      objective: f.objective,
      activeWave: f.activeWave,
      timestamp: new Date().toISOString(),
      duration: { elapsedMs: f.durationMs, formatted: f.formattedDuration, startedAt: f.startedAt },
      concurrency: {
        factor: f.concurrencyFactor,
        totalAgents: f.subagentCounts.total,
        activeAgents: f.subagentCounts.working,
        doneAgents: f.subagentCounts.done,
        blockedAgents: f.subagentCounts.blocked,
      },
      blastRadius: {
        modifiedFiles: f.modifiedFiles,
        modifiedFilesCount: f.modifiedFiles.length,
        publishedContracts: f.publishedContracts,
        publishedContractsCount: f.publishedContracts.length,
      },
      git: f.git,
      agents: f.peers.map((p) => ({
        agentId: p.agentId,
        subagentName: p.subagentName,
        role: p.role,
        status: p.status,
        currentActivity: p.currentActivity,
        modifiedFiles: p.modifiedFiles,
        publishedContracts: p.publishedContracts,
        updatedAt: p.updatedAt,
      })),
      qualityGate: f.qualityGate,
      adrs: f.adrs,
      recommendations: f.recommendations,
    };
  }

  public generate(planId?: string): TeamworkJsonReport {
    return this.generateJsonReport(planId);
  }

  public generateCompact(planId?: string): string {
    return this.generateCompactReport(planId);
  }

  public generateJson(planId?: string): string {
    return JSON.stringify(this.generateJsonReport(planId), null, 2);
  }

  public generateMarkdown(planId?: string): string {
    return this.generateFullReport(planId);
  }

  public saveReport(
    planId?: string,
    outDir?: string,
  ): { filePath: string; bytes: number; relativePath: string } {
    const fullMarkdown = this.generateFullReport(planId);
    const effectivePlanId = planId ?? this.mesh.getMeshState().planId;
    const reportsDir = outDir
      ? path.resolve(this.repoRoot, outDir)
      : path.resolve(this.repoRoot, '.aegis', 'reports');

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filePath = path.join(reportsDir, `report-${effectivePlanId}.md`);
    fs.writeFileSync(filePath, fullMarkdown, 'utf8');
    const bytes = Buffer.byteLength(fullMarkdown, 'utf8');
    const relativePath = path.relative(this.repoRoot, filePath).replace(/\\/g, '/');
    return { filePath, bytes, relativePath };
  }
}
