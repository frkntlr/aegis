/**
 * @file teamwork-deliberation.ts
 * Multi-Agent Deliberation and Blackboard Consensus Engine using TeamworkAnalysisMesh.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { resolveSafeRepoRoot } from '@aegis/shared';
import { TeamworkAnalysisMesh } from './teamwork-analysis-mesh.js';
import { SemanticAIDecomposer } from './semantic-ai-decomposer.js';
import type {
  DeliberationRole,
  DeliberationHypothesis,
  PeerCritique,
  DeliberationConsensus,
  DeliberationResult,
  DeliberationOptions,
  ConsensusStatus,
  ArchitecturalDomain
} from './teamwork-deliberation-types.js';

export * from './teamwork-deliberation-types.js';
export { SemanticAIDecomposer };

function getRoleStrategy(role: DeliberationRole, objective: string): { strategy: string; tradeoffs: string[] } {
  const map: Record<string, { strategy: string; tradeoffs: string[] }> = {
    lead: { strategy: `Establish isolated domain contracts and orchestrate non-overlapping execution waves for "${objective}".`, tradeoffs: ['Strict interface boundaries', 'Slightly higher initial coordination cost'] },
    solver: { strategy: `Implement state machine transitions and streaming pipelines with zero any and <40 lines per function.`, tradeoffs: ['Modular micro-sharding', 'Requires explicit type guards'] },
    qa: { strategy: `Enforce Demir Kafes invariants (<300L, 0 any), error boundaries, and comprehensive unit verification.`, tradeoffs: ['Strict gate failures', 'Requires mock harnesses'] },
    ui: { strategy: `Provide clear visual deliberation feedback and real-time live ASCII state matrices.`, tradeoffs: ['Format verbosity', 'Terminal width constraints'] }
  };
  return map[role] || { strategy: `Synthesize living architecture documentation, update RFC specifications, and align wiki notes.`, tradeoffs: ['Documentation sync latency', 'Requires continuous updates'] };
}

function buildHypothesisCritique(hyp: DeliberationHypothesis, timestamp: string): PeerCritique | null {
  const uid = Math.random().toString(36).slice(2, 6);
  if (hyp.role === 'solver') {
    return {
      id: `crit-qa-${uid}`, hypothesisId: hyp.id, reviewerRole: 'qa', verdict: 'concern', riskLevel: 'medium',
      critique: 'Potential cyclomatic complexity and mutation risk during state machine transitions.',
      suggestedRemedy: 'Enforce strict sub-40 line helpers and comprehensive unit tests.', timestamp
    };
  }
  if (hyp.role === 'lead') {
    return {
      id: `crit-solver-${uid}`, hypothesisId: hyp.id, reviewerRole: 'solver', verdict: 'endorse', riskLevel: 'low',
      critique: 'Domain decoupling aligns with modular decomposition and disjoint file targets.', timestamp
    };
  }
  if (hyp.role === 'qa') {
    return {
      id: `crit-lead-${uid}`, hypothesisId: hyp.id, reviewerRole: 'lead', verdict: 'refine', riskLevel: 'low',
      critique: 'Ensure verification harness does not block non-conflicting foundation solvers.',
      suggestedRemedy: 'Assign QA to Phase 2 waves with explicit dependency on Phase 1.', timestamp
    };
  }
  return null;
}

export class TeamworkDeliberationEngine {
  private repoRoot: string;
  private mesh: TeamworkAnalysisMesh;

  constructor(repoRoot?: string, mesh?: TeamworkAnalysisMesh) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.mesh = mesh ?? new TeamworkAnalysisMesh(this.repoRoot);
  }

  public getMesh(): TeamworkAnalysisMesh {
    return this.mesh;
  }

  private generateHypotheses(
    objective: string,
    domains: ArchitecturalDomain[],
    roles: DeliberationRole[],
    files: string[]
  ): DeliberationHypothesis[] {
    const list: DeliberationHypothesis[] = [];
    const timestamp = new Date().toISOString();

    for (const role of roles) {
      const primaryDomain = domains[list.length % domains.length] || 'data_flow';
      const id = `hyp-${role}-${Math.random().toString(36).slice(2, 6)}`;
      const { strategy, tradeoffs } = getRoleStrategy(role, objective);

      list.push({
        id, role, domain: primaryDomain, strategy, tradeoffs,
        confidence: 0.85 + (list.length % 3) * 0.05,
        suggestedFiles: files.slice(0, 3), timestamp
      });
    }
    return list;
  }

  private generateCritiques(hypotheses: DeliberationHypothesis[]): PeerCritique[] {
    const critiques: PeerCritique[] = [];
    const timestamp = new Date().toISOString();

    for (const hyp of hypotheses) {
      const c = buildHypothesisCritique(hyp, timestamp);
      if (c) critiques.push(c);
    }
    return critiques;
  }

  private synthesizeConsensus(
    objective: string,
    hypotheses: DeliberationHypothesis[],
    critiques: PeerCritique[],
    roles: DeliberationRole[]
  ): DeliberationConsensus {
    let score = 82;
    for (const c of critiques) {
      if (c.verdict === 'endorse') score += 5;
      else if (c.verdict === 'concern') score -= 7;
      else if (c.verdict === 'refine') score -= 3;
      else if (c.verdict === 'reject') score -= 15;
    }
    const avgConfidence = hypotheses.reduce((acc, h) => acc + h.confidence, 0) / (hypotheses.length || 1);
    const consensusScore = Math.max(25, Math.min(100, Math.round(score * avgConfidence)));

    let status: ConsensusStatus = 'stalemate';
    if (consensusScore >= 80) status = 'consensus_reached';
    else if (consensusScore >= 65) status = 'converged';
    else if (consensusScore >= 50) status = 'refined';

    const resolvedTradeoffs = [
      'Adopted Phase 1 foundation solvers with non-overlapping domain files',
      'Assigned QA validation to Phase 2 with strict Demir Kafes gate checks',
      'Unified blackboard shared memory mesh for live inter-agent synchronization'
    ];

    const agreedStrategy = `Converged multi-agent strategy for "${objective}": execute foundation domain logic, enforce Demir Kafes gates, and sync consensus on shared mesh.`;

    return {
      status,
      consensusScore,
      agreedStrategy,
      resolvedTradeoffs,
      participatingRoles: roles
    };
  }

  private recordToMesh(
    hypotheses: DeliberationHypothesis[],
    critiques: PeerCritique[],
    consensus: DeliberationConsensus
  ): void {
    for (const h of hypotheses) {
      this.mesh.postInsight({
        lens: 'relation',
        agent: `deliberation:${h.role}`,
        category: 'contract',
        severity: 'info',
        target: h.domain,
        finding: `[Hypothesis:${h.role}] ${h.strategy}`,
        actionableStep: h.tradeoffs.join('; ')
      });
    }

    for (const c of critiques) {
      const isRisk = c.verdict === 'concern' || c.verdict === 'reject';
      this.mesh.postInsight({
        lens: 'triage',
        agent: `deliberation:critique:${c.reviewerRole}`,
        category: isRisk ? 'flaw' : 'recommendation',
        severity: c.riskLevel === 'high' ? 'high' : (c.riskLevel === 'medium' ? 'medium' : 'info'),
        target: c.hypothesisId,
        finding: `[Critique:${c.reviewerRole} -> ${c.hypothesisId}] ${c.verdict.toUpperCase()}: ${c.critique}`,
        actionableStep: c.suggestedRemedy
      });
    }

    this.mesh.postInsight({
      lens: 'grounding',
      agent: 'deliberation:consensus',
      category: 'contract',
      severity: 'info',
      target: 'consensus',
      finding: `[Consensus:${consensus.status}] Score: ${consensus.consensusScore}%. ${consensus.agreedStrategy}`,
      actionableStep: consensus.resolvedTradeoffs.join('; ')
    });
  }

  public deliberate(
    objective: string,
    files: string[] = [],
    options?: DeliberationOptions
  ): DeliberationResult {
    const start = Date.now();
    const deliberationId = `delib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const roles: DeliberationRole[] = options?.roles ?? ['lead', 'solver', 'qa', 'docs'];

    const domains = SemanticAIDecomposer.detectDomains(objective, files);
    const stateTransitions = SemanticAIDecomposer.inferStateTransitions(objective, domains);
    const dataFlows = SemanticAIDecomposer.inferDataFlows(objective, domains);

    const hypotheses = this.generateHypotheses(objective, domains, roles, files);
    const critiques = this.generateCritiques(hypotheses);
    const consensus = this.synthesizeConsensus(objective, hypotheses, critiques, roles);
    const tasks = SemanticAIDecomposer.decompose(objective, files, domains);

    const persistMesh = options?.persistMesh ?? true;
    if (persistMesh) {
      this.recordToMesh(hypotheses, critiques, consensus);
    }

    return {
      deliberationId,
      objective,
      timestamp: new Date().toISOString(),
      domains,
      stateTransitions,
      dataFlows,
      hypotheses,
      critiques,
      consensus,
      tasks,
      meshRecorded: persistMesh,
      durationMs: Date.now() - start
    };
  }

  public formatDeliberationBriefing(result: DeliberationResult): string {
    const lines: string[] = [];
    lines.push(`🧠 Multi-Agent Deliberation & Blackboard Consensus [${result.deliberationId}]`);
    lines.push(` • Objective: "${result.objective}"`);
    lines.push(` • Status: [${result.consensus.status.toUpperCase()}] | Consensus Score: ${result.consensus.consensusScore}% | Duration: ${result.durationMs}ms`);
    lines.push(` • Architectural Domains: [${result.domains.join(', ')}]`);
    lines.push('\n🔄 Inferred State Machine Transitions:');
    for (const st of result.stateTransitions) lines.push(`   ▶ ${st}`);
    lines.push('\n🌊 Inferred Data Flow Pipelines:');
    for (const df of result.dataFlows) lines.push(`   ↳ ${df}`);
    lines.push('\n💡 Multi-Agent Blackboard Hypotheses:');
    for (const h of result.hypotheses) {
      lines.push(`   • [@${h.role}] (${h.domain}): ${h.strategy}`);
    }
    lines.push('\n🔍 Peer Critiques:');
    for (const c of result.critiques) {
      lines.push(`   • [@${c.reviewerRole} -> ${c.hypothesisId}] [${c.verdict.toUpperCase()}] ${c.critique}`);
    }
    lines.push(`\n🤝 Agreed Consensus Strategy:\n   ${result.consensus.agreedStrategy}`);
    lines.push('\n📋 Semantically Decomposed Tasks:');
    for (const t of result.tasks) {
      lines.push(`   [Phase ${t.phase}] [${t.role.toUpperCase()}] ${t.label}: "${t.title}" (Deps: ${t.dependsOn.join(', ') || 'None'})`);
    }
    return lines.join('\n');
  }
}
