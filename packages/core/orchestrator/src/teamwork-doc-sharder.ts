/**
 * @file teamwork-doc-sharder.ts
 * Shards Phase 3 documentation tasks across parallel doc architect specialists.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { DecomposedSubtask } from './teamwork-decomposer.js';

export interface PartitionedDocFiles {
  wiki: string[];
  readme: string[];
  rfc: string[];
  arch: string[];
}

export class TeamworkDocSharder {
  public static isDocFile(file: string): boolean {
    const norm = file.replace(/\\/g, '/').toLowerCase();
    return norm.endsWith('.md') || norm.includes('docs/') || norm.includes('wiki/');
  }

  public static partitionDocFiles(allFiles: string[]): PartitionedDocFiles {
    const assigned = new Set<string>();
    const docFiles = allFiles.filter(f => this.isDocFile(f));

    const wiki = docFiles.filter(f => {
      const n = f.replace(/\\/g, '/').toLowerCase();
      return n.includes('wiki/') || n.includes('.wiki.') || n.startsWith('wiki/');
    });
    for (const f of wiki) assigned.add(f);

    const readme = docFiles.filter(f => {
      if (assigned.has(f)) return false;
      const n = f.replace(/\\/g, '/').toLowerCase();
      return n.endsWith('readme.md') || n === 'readme.md' || n.endsWith('readme');
    });
    for (const f of readme) assigned.add(f);

    const rfc = docFiles.filter(f => {
      if (assigned.has(f)) return false;
      const n = f.replace(/\\/g, '/').toLowerCase();
      return n.includes('docs/rfc') || n.includes('/rfc/') || n.includes('docs/adr') || n.includes('/adr/') || n.includes('rfc-') || n.includes('adr-');
    });
    for (const f of rfc) assigned.add(f);

    const arch = docFiles.filter(f => !assigned.has(f));
    return { wiki, readme, rfc, arch };
  }

  private static buildSpecialistSubtasks(
    baseTitle: string,
    partitioned: PartitionedDocFiles,
    deps: string[] = []
  ): DecomposedSubtask[] {
    const specs: Array<[string, string, string[]]> = [
      ['Wiki', 'GitHub Wiki live synchronization & living memory', partitioned.wiki],
      ['Readme', 'Root README.md architecture updates, badges & feature matrix', partitioned.readme],
      ['RFC', 'Specification documents, ADRs & architectural decisions', partitioned.rfc],
      ['Architecture', 'Mermaid topology, system components & contracts', partitioned.arch]
    ];
    return specs.map(([label, desc, files]) => ({
      roleType: 'docs',
      label,
      title: `${baseTitle} [${label}]: ${desc}`,
      targetFiles: files,
      phase: 3,
      dependsOn: deps
    }));
  }

  public static shardDocsBySpecialists(
    subtasks: DecomposedSubtask[],
    allFiles: string[],
    objective: string,
    maxConcurrency = 12
  ): DecomposedSubtask[] {
    const docTasks = subtasks.filter(t => t.roleType === 'docs');
    const specialistLabels = new Set(['Architecture', 'Readme', 'RFC', 'Wiki']);
    if (docTasks.length === 0 || maxConcurrency <= 1 || docTasks.some(t => specialistLabels.has(t.label))) {
      return subtasks;
    }

    const firstDocIndex = subtasks.findIndex(t => t.roleType === 'docs');
    const baseTitle = docTasks[0]?.title || objective;
    const existingDeps = docTasks[0]?.dependsOn ? [...docTasks[0].dependsOn] : [];

    const partitioned = this.partitionDocFiles(allFiles);
    for (const dt of docTasks) {
      for (const f of dt.targetFiles) {
        if (!partitioned.wiki.includes(f) && !partitioned.readme.includes(f) && !partitioned.rfc.includes(f) && !partitioned.arch.includes(f)) {
          partitioned.arch.push(f);
        }
      }
    }

    const specialists = this.buildSpecialistSubtasks(baseTitle, partitioned, existingDeps);
    specialists.sort((a, b) => (b.targetFiles.length > 0 ? 1 : 0) - (a.targetFiles.length > 0 ? 1 : 0));
    const count = Math.min(specialists.length, Math.max(1, maxConcurrency));
    const selected = specialists.slice(0, count);

    const nonDocSubtasks = subtasks.filter(t => t.roleType !== 'docs');
    nonDocSubtasks.splice(firstDocIndex, 0, ...selected);
    subtasks.length = 0;
    subtasks.push(...nonDocSubtasks);
    return subtasks;
  }
}
