/**
 * @file teamwork-decomposer.ts
 * Decomposes objectives into granular subtasks and statically partitions files.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { RoleClassifier, type RoleType } from './role-classifier.js';
import { TeamworkSharder } from './teamwork-sharder.js';
import { TeamworkHierarchicalTree } from './teamwork-hierarchical-tree.js';
import { TeamworkDocSharder } from './teamwork-doc-sharder.js';

export { TeamworkSharder, TeamworkHierarchicalTree, TeamworkDocSharder };

export interface DecomposedSubtask {
  roleType: RoleType;
  label: string;
  title: string;
  targetFiles: string[];
  dependsOn?: string[];
  phase?: number;
}

export interface DecomposeOptions {
  maxConcurrency?: number;
  autoScale?: boolean;
  selectedRoles?: RoleType[];
  explicitRole?: string;
  treeSpecialists?: boolean;
}

export class TeamworkDecomposer {
  private static readonly STOP_WORDS = new Set([
    've', 'and', 'ile', 'with', 'for', 'the', 'bir', 'bu', 'da', 'de',
    'hala', 'hâlâ', 'başka', 'daha', 'cok', 'çok', 'ise', 'gibi',
    'tam', 'bununla', 'buna', 'bunu', 'ilgili', 'görevi', 'gorevi',
    'görev', 'gorev', 'üzerine', 'uzerine', 'çalışma', 'calisma',
    'çalış', 'calis', 'duruyor', 'zorluk', 'olan', 'olarak', 'için', 'icin'
  ]);

  private static readonly FALLBACK_LABELS = [
    'MultiAgent',
    'TaskSharder',
    'PerformanceRadar',
    'MeshProtocol',
    'GateAudit'
  ] as const;

  private static resolveDomainWord(word: string): string | null {
    const lower = word.toLowerCase();
    if (/^(multi|ajan|agent|paralel|team|coklu|çoklu)$/.test(lower)) return 'MultiAgent';
    if (/^(shard|bolmekte|bölmekte|dagitmakta|dağıtmakta|sharder)$/.test(lower)) return 'TaskSharder';
    if (/^(bug|radar|speed)$/.test(lower)) return 'PerformanceRadar';
    return null;
  }

  private static resolveFallbackLabel(title: string): string {
    const lower = title.toLowerCase();
    if (/multi|ajan|agent|paralel|team/.test(lower)) return 'MultiAgent';
    if (/shard|böl|bol|dağıt|dagit|part|parça|parca/.test(lower)) return 'TaskSharder';
    if (/performans|hız|hiz|radar|optimi|speed|bug/.test(lower)) return 'PerformanceRadar';
    if (/mesh|protokol|protocol|iletisim|iletişim|sync/.test(lower)) return 'MeshProtocol';
    if (/audit|gate|kafes|cage|denetim|test/.test(lower)) return 'GateAudit';
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = ((hash << 5) - hash) + title.charCodeAt(i);
      hash |= 0;
    }
    return this.FALLBACK_LABELS[Math.abs(hash) % this.FALLBACK_LABELS.length];
  }

  public static decompose(
    objective: string,
    targetFiles: string[] = [],
    options?: DecomposeOptions
  ): DecomposedSubtask[] {
    const selectedRoles = options?.selectedRoles ?? TeamworkHierarchicalTree.detectSelectedRoles(objective, options?.explicitRole);
    const isTree = options?.treeSpecialists || TeamworkHierarchicalTree.isHierarchicalRequested(objective);

    const rawItems = this.splitObjective(objective);
    const parsed = rawItems.map(item => this.classifyRawItem(item));
    let subtasks = this.enrichSubtasks(parsed);
    if (selectedRoles && selectedRoles.length > 0) {
      subtasks = subtasks.filter(t => selectedRoles.includes(t.roleType));
    }
    this.ensureRequiredTracks(subtasks, objective, targetFiles, selectedRoles);

    if (isTree) {
      subtasks = TeamworkHierarchicalTree.expandHierarchicalRoles(subtasks, selectedRoles, objective, targetFiles);
    }

    if (rawItems.length <= 1) {
      this.shardSolversAndQa(subtasks, targetFiles, objective, options);
    }
    TeamworkDocSharder.shardDocsBySpecialists(subtasks, targetFiles, objective, options?.maxConcurrency ?? 12);
    TeamworkSharder.partitionFiles(subtasks, targetFiles);
    this.assignPhasesAndDependencies(subtasks);

    const shouldScale = !isTree && Boolean(
      options?.autoScale || (options?.maxConcurrency && options.maxConcurrency > 4) ||
      (targetFiles.length === 0 && options?.maxConcurrency && options.maxConcurrency > 1) ||
      (targetFiles.length === 1 && options?.autoScale) ||
      (targetFiles.length >= 2 && options?.maxConcurrency && options.maxConcurrency > 1)
    );
    if (shouldScale) {
      const maxC = options?.maxConcurrency ?? 12;
      return this.shardMaxConcurrency(subtasks, targetFiles, maxC);
    }
    return subtasks;
  }

  private static shardSolversAndQa(
    subtasks: DecomposedSubtask[],
    targetFiles: string[],
    objective: string,
    options?: DecomposeOptions
  ): void {
    TeamworkSharder.shardSolversByFiles(subtasks, targetFiles, objective);
    const allowDimensions = Boolean(
      options?.autoScale ||
      (options?.maxConcurrency && options.maxConcurrency > 1) ||
      (!options?.explicitRole && targetFiles.length === 0)
    );
    TeamworkSharder.shardQaByFiles(subtasks, targetFiles, objective, allowDimensions);
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

    const sentences = trimmed.split(/[.!?]+(?:\s+|$)/).map(s => s.trim()).filter(s => s.length >= 3);
    if (sentences.length > 1) return sentences;

    if (trimmed.includes(',')) {
      const items = trimmed.split(',').map(s => s.trim().replace(/[.!?]+$/, '')).filter(p => p.length >= 3);
      if (items.length >= 2) return items;
    }

    return this.splitCompoundSentence(trimmed);
  }

  private static splitCompoundSentence(text: string): string[] {
    const lower = text.toLowerCase();
    const splitPoints = [
      ' ve de ', ' hem de ', ' as well as ',
      ' aynı zamanda ', ' bunun yanında ', ' ayrıca ',
      ' ve ', ' and ', ' ile ', ' & '
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
    if (words.length === 0) return this.resolveFallbackLabel(title);
    const candidate = words[0].replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, '');
    if (!candidate || candidate.length < 3 || this.STOP_WORDS.has(candidate.toLowerCase())) {
      return this.resolveFallbackLabel(title);
    }
    const domainWord = this.resolveDomainWord(candidate);
    if (domainWord) return domainWord;
    return candidate.charAt(0).toUpperCase() + candidate.slice(1).slice(0, 15);
  }

  private static classifyRawItem(raw: string): { roleType: RoleType; label: string; title: string } {
    const title = raw.replace(/^(\d+[\.\)]|\*|-|•)\s*/, '').trim();
    const lower = title.toLowerCase();
    let roleType: RoleType = 'solver';
    if (lower.includes('audit') || lower.includes('triage') || lower.includes('kafes') || lower.includes('denetim') || lower.includes('test') || lower.includes('doğrula') || lower.includes('dogrula')) {
      roleType = 'qa';
    } else if (lower.includes('ui') || lower.includes('theme') || lower.includes('hud') || lower.includes('pause menu') || lower.includes('layout') || lower.includes('arayüz') || lower.includes('arayuz') || lower.includes('tema') || lower.includes('görsel') || lower.includes('gorsel') || lower.includes('ekran')) {
      roleType = 'ui';
    } else if (lower.startsWith('doc') || lower.includes('wiki') || lower.includes('rfc') || lower.includes('dokümantasyon') || lower.includes('dokumantasyon') || lower.includes('document') || lower.includes('belge')) {
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
    allFiles: string[],
    selectedRoles?: RoleType[] | null
  ): void {
    const isAllowed = (role: RoleType): boolean => !selectedRoles || selectedRoles.includes(role);
    if (isAllowed('solver') && !subtasks.some(t => t.roleType === 'solver')) {
      subtasks.unshift({ roleType: 'solver', label: 'Core', title: `Implement core logic: ${objective}`, targetFiles: [] });
    }
    const hasUiSignal = allFiles.some(f => RoleClassifier.isUiFile(f)) || /ui|arayüz|arayuz|theme|hud|tasarım|tasarim|ekran|görsel/i.test(objective);
    if (isAllowed('ui') && hasUiSignal && !subtasks.some(t => t.roleType === 'ui')) {
      subtasks.push({ roleType: 'ui', label: 'UI', title: `Refine UI layouts: ${objective}`, targetFiles: [] });
    }
    const hasDocSignal = allFiles.some(f => f.endsWith('.md') || f.includes('docs/')) || /doc|wiki|rfc|dokümantasyon|belge/i.test(objective);
    if (isAllowed('docs') && hasDocSignal && !subtasks.some(t => t.roleType === 'docs')) {
      subtasks.push({ roleType: 'docs', label: 'Docs', title: `Document specs: ${objective}`, targetFiles: [] });
    }
    if (isAllowed('qa') && !subtasks.some(t => t.roleType === 'qa')) {
      subtasks.push({ roleType: 'qa', label: 'Audit', title: `Audit, triage, and test: ${objective}`, targetFiles: [] });
    }
    if (subtasks.length === 0) {
      subtasks.push({ roleType: 'solver', label: 'Core', title: `Implement core logic: ${objective}`, targetFiles: [] });
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
