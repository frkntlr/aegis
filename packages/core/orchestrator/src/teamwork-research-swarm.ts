/**
 * @file teamwork-research-swarm.ts
 * Coordinates Phase 0 concurrent research swarms for deep architectural exploration,
 * NotebookLM grounding, AST structure discovery, and flaw triage.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { TeamworkTrack } from './teamwork-types.js';

export interface ResearchSpecialist {
  role: 'docs' | 'solver' | 'qa';
  subagentName: string;
  focus: string;
  assignedTools: string[];
  outputArtifact: string;
}

export const RESEARCH_SWARM_SPECIALISTS: ResearchSpecialist[] = [
  {
    role: 'docs',
    subagentName: 'doc-architect [NLM-Researcher]',
    focus: 'Google NotebookLM ground-truth knowledge query and deep architectural research',
    assignedTools: ['nlm_query', 'nlm_research', 'notebook_query'],
    outputArtifact: 'docs/research/notebooklm-grounding.md'
  },
  {
    role: 'docs',
    subagentName: 'doc-architect [Wiki-Architect]',
    focus: 'Living GitHub Wiki synthesis, RFC architecture blueprint, and index synchronization',
    assignedTools: ['wiki_sync', 'rfc_create', 'rfc_decompose'],
    outputArtifact: 'docs/research/architecture-blueprint.md'
  },
  {
    role: 'solver',
    subagentName: 'issue-solver [AST-Explorer]',
    focus: 'Codebase AST pattern search, symbol definitions, caller graph, and blast radius',
    assignedTools: ['find_symbol', 'ast_search', 'trace_relational'],
    outputArtifact: 'docs/research/ast-blast-radius.md'
  },
  {
    role: 'qa',
    subagentName: 'qa-hunter [Triage-Auditor]',
    focus: 'Evidence-based flaw triage, invariant compliance, and Demir Kafes line headroom audit',
    assignedTools: ['triage', 'cage_check', 'audit'],
    outputArtifact: 'docs/research/triage-audit.md'
  }
];

export class TeamworkResearchSwarm {
  public static isResearchRequested(objective: string): boolean {
    return /(?:araştır|research|investigat|incele|mimari\s+analiz|grounding|deep\s*dive)/i.test(objective);
  }

  public static buildResearchTracks(objective: string, planId: string): TeamworkTrack[] {
    return RESEARCH_SWARM_SPECIALISTS.map((spec, idx) => {
      const prompt = this.buildResearchPrompt(spec, objective);
      return {
        id: `${planId}-res-${idx + 1}`,
        roleType: spec.role,
        subagentName: spec.subagentName,
        title: `Phase 0 Research: ${spec.focus} (${objective})`,
        targetFiles: [spec.outputArtifact],
        phase: 0,
        prompt,
        assignedAegisTools: spec.assignedTools,
        dependsOn: [],
        invocationPayload: {
          TypeName: spec.role === 'docs' ? 'doc-architect' : spec.role === 'solver' ? 'issue-solver' : 'qa-hunter',
          Role: `Deep Research Specialist - ${spec.subagentName}`,
          Prompt: prompt,
          Workspace: 'share' as const,
          Model: (spec.role === 'docs' ? 'flash' : 'inherit') as 'inherit' | 'flash'
        }
      };
    });
  }

  private static buildResearchPrompt(spec: ResearchSpecialist, objective: string): string {
    return [
      `🔬 [RESEARCH SWARM] AKTİF | ${spec.subagentName}`,
      `## Research Mission`,
      `**Objective**: ${objective}`,
      `**Focus**: ${spec.focus}`,
      `**Assigned Tools**: [${spec.assignedTools.join(', ')}]`,
      `**Target Output Artifact**: \`${spec.outputArtifact}\``,
      '',
      `### Instructions`,
      `1. Perform deep investigation using your assigned Aegis tools without modifying existing source code.`,
      `2. Synthesize your factual evidence, AST traces, or NotebookLM insights directly into \`${spec.outputArtifact}\`.`,
      `3. Post your research milestone to peer agents via \`aegis tw:post "Research findings updated" --files="${spec.outputArtifact}"\`.`,
      `4. Report completion back to Team Lead with \`[ROLE_COMPLETE: ${spec.subagentName}]\`.`
    ].join('\n');
  }
}
