import type { TriageFinding } from './triage-gate.js';

export type DefectTier =
  | 'TIER_1_CRITICAL_BLAST'
  | 'TIER_2_ISOLATED_DEFECT'
  | 'TIER_3_DEMIR_KAFES_DEBT'
  | 'TIER_4_CODE_SMELL';

export interface StratifiedFinding extends TriageFinding {
  tier: DefectTier;
  blastRadius: number;
  dependents: string[];
}

export interface RelationalEdgeRef {
  from: string;
  to: string;
  type?: string;
}

export interface RelationalGraphProvider {
  getIncoming(id: string): RelationalEdgeRef[];
}

export interface StratifierOptions {
  graph?: RelationalGraphProvider;
  maxDepth?: number;
  criticalThreshold?: number;
}

const TIER_ORDER: Record<DefectTier, number> = {
  TIER_1_CRITICAL_BLAST: 1,
  TIER_2_ISOLATED_DEFECT: 2,
  TIER_3_DEMIR_KAFES_DEBT: 3,
  TIER_4_CODE_SMELL: 4
};

export class BlastRadiusStratifier {
  public static calculateBlastRadius(
    filePath: string,
    graph?: RelationalGraphProvider,
    maxDepth = 3
  ): { radius: number; dependents: string[] } {
    if (!graph || typeof graph.getIncoming !== 'function') {
      return { radius: 0, dependents: [] };
    }

    const norm = filePath.replace(/\\/g, '/');
    const visited = new Set<string>([norm]);
    let currentLevel = [norm];
    let depth = 0;

    while (currentLevel.length > 0 && depth < maxDepth) {
      depth++;
      const nextLevel: string[] = [];
      for (const node of currentLevel) {
        const incoming = graph.getIncoming(node) || [];
        for (const edge of incoming) {
          const fromNode = edge.from.replace(/\\/g, '/');
          if (!visited.has(fromNode)) {
            visited.add(fromNode);
            nextLevel.push(fromNode);
          }
        }
      }
      currentLevel = nextLevel;
    }

    visited.delete(norm);
    const dependents = Array.from(visited);
    return { radius: dependents.length, dependents };
  }

  public static stratifyFinding(
    finding: TriageFinding,
    options: StratifierOptions = {}
  ): StratifiedFinding {
    const maxDepth = options.maxDepth ?? 3;
    const threshold = options.criticalThreshold ?? 5;
    const { radius, dependents } = this.calculateBlastRadius(
      finding.filePath,
      options.graph,
      maxDepth
    );

    const tier = this.resolveTier(finding, radius, threshold);

    return {
      ...finding,
      tier,
      blastRadius: radius,
      dependents
    };
  }

  private static resolveTier(
    finding: TriageFinding,
    radius: number,
    threshold: number
  ): DefectTier {
    if (finding.category === 'CRITICAL_DEFECT') {
      const isUrgentType =
        finding.defectType === 'TEST_FAILURE' ||
        finding.defectType === 'SYNTAX_ERROR' ||
        finding.defectType === 'CIRCULAR_DEPENDENCY';
      if (radius >= threshold || isUrgentType) {
        return 'TIER_1_CRITICAL_BLAST';
      }
      return 'TIER_2_ISOLATED_DEFECT';
    }

    if (finding.category === 'ARCHITECTURAL_DEBT') {
      return 'TIER_3_DEMIR_KAFES_DEBT';
    }

    return 'TIER_4_CODE_SMELL';
  }

  public static stratifyAll(
    findings: TriageFinding[],
    options: StratifierOptions = {}
  ): StratifiedFinding[] {
    const stratified = findings.map(f => this.stratifyFinding(f, options));

    return stratified.sort((a, b) => {
      const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
      if (tierDiff !== 0) return tierDiff;
      return b.blastRadius - a.blastRadius;
    });
  }
}
