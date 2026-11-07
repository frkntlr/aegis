/**
 * @file semantic-ai-decomposer.ts
 * Semantic AI Decomposition by architectural domains, state machines, and data flows.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';
import type {
  ArchitecturalDomain,
  SemanticDecompositionItem
} from './teamwork-deliberation-types.js';

interface DomainKeywordRule {
  domain: ArchitecturalDomain;
  keywords: string[];
  fileExtensions: string[];
}

const DOMAIN_RULES: DomainKeywordRule[] = [
  {
    domain: 'state_machine',
    keywords: ['state', 'durum', 'transition', 'gecis', 'fsm', 'lifecycle', 'workflow', 'phase', 'wave', 'stage', 'lock', 'mutex'],
    fileExtensions: ['-mutex.ts', '-lock-', '-lifecycle', '-waves.ts']
  },
  {
    domain: 'data_flow',
    keywords: ['data', 'flow', 'pipeline', 'stream', 'store', 'mesh', 'event', 'bus', 'transform', 'verı', 'akış', 'persist', 'inbox'],
    fileExtensions: ['-mesh.ts', '-store.ts', '-inbox.ts', '-stream.ts']
  },
  {
    domain: 'api_surface',
    keywords: ['api', 'cli', 'command', 'endpoint', 'interface', 'komut', 'mcp', 'router', 'tool', 'handler', 'route'],
    fileExtensions: ['-command.ts', 'commands/', '-adapter.ts', '-launcher.ts']
  },
  {
    domain: 'validation_safety',
    keywords: ['audit', 'test', 'validate', 'dogrula', 'doğrula', 'safety', 'guard', 'güvenlik', 'kafes', 'cage', 'invariant', 'check', 'risk'],
    fileExtensions: ['.test.ts', '.spec.ts', '-validator.ts', '-rules.ts']
  },
  {
    domain: 'ui_presentation',
    keywords: ['ui', 'theme', 'hud', 'view', 'ekran', 'matrix', 'visual', 'görsel', 'format', 'ascii', 'display', 'table', 'dag', 'render', 'dashboard'],
    fileExtensions: ['.tres', '.theme', 'ui/', '-visualizer.ts']
  },
  {
    domain: 'infrastructure',
    keywords: ['worktree', 'git', 'fs', 'io', 'process', 'daemon', 'timer', 'sync', 'file', 'altyapı', 'dosya', 'toolchain'],
    fileExtensions: ['worktree-', '-sync.ts', 'scripts/']
  },
  {
    domain: 'documentation',
    keywords: ['doc', 'spec', 'wiki', 'rfc', 'rehber', 'belge', 'markdown', 'dokuman', 'doküman', 'readme'],
    fileExtensions: ['.md', 'docs/', 'wiki/']
  }
];

export class SemanticAIDecomposer {
  public static detectDomains(objective: string, files: string[] = []): ArchitecturalDomain[] {
    const lowerObj = objective.toLowerCase();
    const normalizedFiles = files.map(f => f.toLowerCase().replace(/\\/g, '/'));
    const matched = new Set<ArchitecturalDomain>();

    for (const rule of DOMAIN_RULES) {
      const textMatch = rule.keywords.some(kw => lowerObj.includes(kw));
      const fileMatch = normalizedFiles.some(f => rule.fileExtensions.some(ext => f.includes(ext)));
      if (textMatch || fileMatch) {
        matched.add(rule.domain);
      }
    }

    if (matched.size === 0) {
      matched.add('data_flow');
      matched.add('api_surface');
      matched.add('validation_safety');
    }
    return Array.from(matched);
  }

  public static inferStateTransitions(objective: string, domains: ArchitecturalDomain[]): string[] {
    const transitions: string[] = [];
    const lower = objective.toLowerCase();

    if (domains.includes('state_machine') || lower.includes('state') || lower.includes('fsm') || lower.includes('transition')) {
      transitions.push('IDLE -> INITIALIZING -> ACTIVE -> TRANSITIONING -> CONVERGED');
      transitions.push('STAGE_ACQUIRED -> ATOMIC_EXECUTION -> RECONCILED -> RELEASED');
    }
    if (domains.includes('data_flow') || lower.includes('pipeline') || lower.includes('stream')) {
      transitions.push('INGESTION -> VALIDATION -> TRANSFORMATION -> PERSISTENCE');
    }
    if (domains.includes('validation_safety') || lower.includes('test') || lower.includes('audit')) {
      transitions.push('UNVERIFIED -> INVARIANT_AUDIT -> DYNAMIC_GATE -> CAGE_PASSED');
    }
    if (transitions.length === 0) {
      transitions.push('SPECIFIED -> DELIBERATING -> STAGED -> EXECUTED -> VERIFIED');
    }
    return transitions;
  }

  public static inferDataFlows(objective: string, domains: ArchitecturalDomain[]): string[] {
    const flows: string[] = [];
    const lower = objective.toLowerCase();

    flows.push('ObjectivePrompt -> SemanticAIDecomposer -> DomainPartition -> TaskInbox');
    if (domains.includes('data_flow') || domains.includes('api_surface')) {
      flows.push('AnalysisMesh (Shared Memory) <-> Blackboard (Hypothesis & Critique) -> Consensus');
    }
    if (domains.includes('validation_safety') || lower.includes('audit') || lower.includes('cage')) {
      flows.push('TaskExecution -> AST/Test Harness -> IronCageValidator -> AuditReport');
    }
    if (domains.includes('ui_presentation')) {
      flows.push('StateMatrix -> LiveVisualizer -> TerminalAsciiStream');
    }
    return flows;
  }

  private static mapDomainToRole(domain: ArchitecturalDomain): RoleType {
    if (domain === 'validation_safety') return 'qa';
    if (domain === 'ui_presentation') return 'ui';
    if (domain === 'documentation') return 'docs';
    return 'solver';
  }

  private static mapDomainToLabel(domain: ArchitecturalDomain): string {
    const map: Record<ArchitecturalDomain, string> = {
      state_machine: 'StateMachine',
      data_flow: 'DataFlow',
      api_surface: 'ApiSurface',
      validation_safety: 'SafetyGate',
      ui_presentation: 'UI',
      infrastructure: 'Infra',
      documentation: 'Specs'
    };
    return map[domain];
  }

  private static partitionFilesForDomain(domain: ArchitecturalDomain, files: string[]): string[] {
    const rule = DOMAIN_RULES.find(r => r.domain === domain);
    if (!rule || files.length === 0) return [];
    return files.filter(f => {
      const lower = f.toLowerCase().replace(/\\/g, '/');
      return rule.fileExtensions.some(ext => lower.includes(ext));
    });
  }

  public static decompose(
    objective: string,
    targetFiles: string[] = [],
    forcedDomains?: ArchitecturalDomain[]
  ): SemanticDecompositionItem[] {
    const domains = forcedDomains && forcedDomains.length > 0
      ? forcedDomains
      : this.detectDomains(objective, targetFiles);
    const stateTransitions = this.inferStateTransitions(objective, domains);
    const dataFlows = this.inferDataFlows(objective, domains);

    const foundationLabels: string[] = [];
    const items: SemanticDecompositionItem[] = [];

    for (const domain of domains) {
      const role = this.mapDomainToRole(domain);
      const label = this.mapDomainToLabel(domain);
      const isFoundation = role === 'solver';
      const phase = isFoundation ? 1 : (role === 'docs' ? 3 : 2);
      const dependsOn = isFoundation ? [] : (role === 'docs' ? ['SafetyGate'] : [...foundationLabels]);

      if (isFoundation) foundationLabels.push(label);

      items.push({
        id: `sem-${domain}-${Math.random().toString(36).slice(2, 6)}`,
        domain,
        role,
        label,
        title: `${label}: Implement and align ${domain.replace('_', ' ')} for "${objective}"`,
        rationale: `Architectural domain ${domain} isolated for non-conflicting parallel execution.`,
        stateTransitions: stateTransitions.slice(0, 2),
        dataFlows: dataFlows.slice(0, 2),
        targetFiles: this.partitionFilesForDomain(domain, targetFiles),
        dependsOn,
        phase
      });
    }

    return items;
  }

  public static toDecomposedSubtasks(items: SemanticDecompositionItem[]): DecomposedSubtask[] {
    return items.map(item => ({
      roleType: item.role,
      label: item.label,
      title: item.title,
      targetFiles: item.targetFiles,
      dependsOn: item.dependsOn,
      phase: item.phase
    }));
  }
}
