/**
 * @file teamwork-decomposer.ts
 * Decomposes objectives into granular subtasks and statically partitions files.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { RoleClassifier, type RoleType } from './role-classifier.js';
import { TeamworkSharder } from './teamwork-sharder.js';

export { TeamworkSharder };

export interface DecomposedSubtask {
  roleType: RoleType;
  label: string;
  title: string;
  targetFiles: string[];
  dependsOn?: string[];
  phase?: number;
}

export class TeamworkDecomposer {
  private static readonly STOP_WORDS = new Set(['ve', 'and', 'ile', 'with', 'for', 'the', 'bir', 'bu', 'da', 'de']);

  public static decompose(
    objective: string,
    targetFiles: string[] = [],
    options?: { maxConcurrency?: number; autoScale?: boolean }
  ): DecomposedSubtask[] {
    const rawItems = this.splitObjective(objective);
    const parsed = rawItems.map(item => this.classifyRawItem(item));
    const subtasks = this.enrichSubtasks(parsed);
    this.ensureRequiredTracks(subtasks, objective, targetFiles);
    if (options?.autoScale || (options?.maxConcurrency && options.maxConcurrency > 1)) {
      const maxC = options.maxConcurrency ?? 12;
      return this.shardMaxConcurrency(subtasks, targetFiles, maxC);
    }
    TeamworkSharder.shardSolversByFiles(subtasks, targetFiles, objective);
    TeamworkSharder.partitionFiles(subtasks, targetFiles);
    this.assignPhasesAndDependencies(subtasks);
    return subtasks;
  }

  public static splitObjective(objective: string): string[] {
    const trimmed = objective.trim();
    if (!trimmed) return ['Default Task'];

    const numberedRegex = /(?:^|\n|\s+)(?:\d+[\.\)]|\*|-|•)\s+/;
    if (numberedRegex.test(trimmed)) {
      const items = trimmed.split(/(?:^|\n|\s+)(?:\d+[\.\)]|\*|-|•)\s+/).map(s => s.trim()).filter(Boolean);
      if (items.length > 1) return items;
    }

    if (trimmed.includes(';') || trimmed.includes(' && ')) {
      const items = trimmed.split(/;|\s+&&\s+/).map(s => s.trim()).filter(Boolean);
      if (items.length > 1) return items;
    }

    if (trimmed.includes('\n')) {
      const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) return lines;
    }

    if (/[.!?]\s+/.test(trimmed)) {
      const sentences = trimmed.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length >= 8);
      if (sentences.length > 1) return sentences;
    }

    if (trimmed.includes(',')) {
      const items = trimmed.split(',').map(s => s.trim()).filter(p => p.length >= 3);
      if (items.length >= 3) return items;
    }

    return this.splitCompoundSentence(trimmed);
  }

  private static splitCompoundSentence(text: string): string[] {
    const lower = text.toLowerCase();
    const splitPoints = [
      ' ve ', ' and ', ' hem de ', ' as well as ',
      ' aynı zamanda ', ' bunun yanında ', ' ayrıca '
    ];
    for (const sp of splitPoints) {
      if (lower.includes(sp)) {
        const parts = text.split(new RegExp(sp, 'i')).map(p => p.trim()).filter(p => p.length >= 3);
        if (parts.length > 1) return parts;
      }
    }
    return [text];
  }

  public static extractLabel(title: string, role: RoleType): string {
    const cleaned = title.replace(/^(\d+[\.\)]|\*|-|•)\s*/, '').trim();
    const words = cleaned.split(/\s+/).filter(w => !this.STOP_WORDS.has(w.toLowerCase()));
    if (role === 'ui') return 'UI';
    if (role === 'docs') return 'Docs';
    if (role === 'qa') return 'Audit';
    if (words.length === 0) return 'Core';
    const candidate = words[0].replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, '');
    return candidate ? candidate.charAt(0).toUpperCase() + candidate.slice(1).slice(0, 15) : 'Core';
  }

  private static classifyRawItem(raw: string): { roleType: RoleType; label: string; title: string } {
    const title = raw.replace(/^(\d+[\.\)]|\*|-|•)\s*/, '').trim();
    const lower = title.toLowerCase();
    let roleType: RoleType = 'solver';
    if (lower.includes('audit') || lower.includes('triage') || lower.includes('kafes') || lower.includes('denetim') || lower.startsWith('test')) {
      roleType = 'qa';
    } else if (lower.includes('ui') || lower.includes('theme') || lower.includes('hud') || lower.includes('pause menu') || lower.includes('layout')) {
      roleType = 'ui';
    } else if (lower.startsWith('doc') || lower.includes('wiki') || lower.includes('rfc') || lower.includes('dokümantasyon') || lower.includes('document')) {
      roleType = 'docs';
    }
    const label = this.extractLabel(title, roleType);
    return { roleType, label, title };
  }

  private static enrichSubtasks(
    items: Array<{ roleType: RoleType; label: string; title: string }>
  ): DecomposedSubtask[] {
    const labelsSeen = new Map<string, number>();
    return items.map(item => {
      const count = (labelsSeen.get(item.label) ?? 0) + 1;
      labelsSeen.set(item.label, count);
      const uniqueLabel = count > 1 ? `${item.label}-${count}` : item.label;
      return {
        roleType: item.roleType,
        label: uniqueLabel,
        title: item.title,
        targetFiles: []
      };
    });
  }

  private static ensureRequiredTracks(
    subtasks: DecomposedSubtask[],
    objective: string,
    allFiles: string[]
  ): void {
    if (!subtasks.some(t => t.roleType === 'solver')) {
      subtasks.unshift({
        roleType: 'solver',
        label: 'Core',
        title: `Implement core logic for: ${objective}`,
        targetFiles: []
      });
    }
    if (allFiles.some(f => RoleClassifier.isUiFile(f)) && !subtasks.some(t => t.roleType === 'ui')) {
      subtasks.push({
        roleType: 'ui',
        label: 'UI',
        title: `Refine UI layouts and themes for: ${objective}`,
        targetFiles: []
      });
    }
    if (allFiles.some(f => f.endsWith('.md') || f.includes('docs/')) && !subtasks.some(t => t.roleType === 'docs')) {
      subtasks.push({
        roleType: 'docs',
        label: 'Docs',
        title: `Document specifications for: ${objective}`,
        targetFiles: []
      });
    }
    if (!subtasks.some(t => t.roleType === 'qa')) {
      subtasks.push({
        roleType: 'qa',
        label: 'Audit',
        title: `Audit, triage, and test: ${objective}`,
        targetFiles: []
      });
    }
  }

  private static assignPhasesAndDependencies(subtasks: DecomposedSubtask[]): void {
    const foundationLabels: string[] = [];
    for (const t of subtasks) {
      if (t.roleType === 'solver' || t.roleType === 'ui') {
        t.phase = 1;
        t.dependsOn = [];
        foundationLabels.push(t.label);
      }
    }

    const qaLabels: string[] = [];
    for (const t of subtasks) {
      if (t.roleType === 'qa') {
        t.phase = foundationLabels.length > 0 ? 2 : 1;
        t.dependsOn = [...foundationLabels];
        qaLabels.push(t.label);
      }
    }

    const docDeps = qaLabels.length > 0 ? qaLabels : foundationLabels;
    for (const t of subtasks) {
      if (t.roleType === 'docs') {
        t.phase = qaLabels.length > 0 ? 3 : foundationLabels.length > 0 ? 2 : 1;
        t.dependsOn = [...docDeps];
      }
    }
  }

  public static shardMaxConcurrency(
    subtasks: DecomposedSubtask[],
    targetFiles: string[],
    maxConcurrency = 12
  ): DecomposedSubtask[] {
    const sharded = TeamworkSharder.shardMaxConcurrency(subtasks, targetFiles, maxConcurrency);
    this.assignPhasesAndDependencies(sharded);
    return sharded;
  }
}

