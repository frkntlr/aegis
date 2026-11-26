import type { DecomposedSubtask } from './teamwork-decomposer.js';

export function hasDimensionedQaHelper(tasks: DecomposedSubtask[]): boolean {
  return tasks.some(t => t.roleType === 'qa' && ['StaticAudit', 'TypeSafety', 'SafetyGate'].includes(t.label));
}

export function shardQaByDimensionsHelper(
  subtasks: DecomposedSubtask[],
  objective: string,
  companionTest?: string
): void {
  if (hasDimensionedQaHelper(subtasks)) return;
  const qaIndex = subtasks.findIndex(t => t.roleType === 'qa');
  if (qaIndex === -1) return;
  const baseTitle = subtasks[qaIndex].title || objective;
  const testFile = companionTest ? [companionTest] : [];
  const dims = [
    { label: 'StaticAudit', title: `${baseTitle} [StaticAudit]: Linting, AST patterns & conventions`, files: testFile },
    { label: 'TypeSafety', title: `${baseTitle} [TypeSafety]: TypeScript checks & contract integrity`, files: [] as string[] },
    { label: 'SafetyGate', title: `${baseTitle} [SafetyGate]: Cage compliance & boundary safety`, files: [] as string[] }
  ];
  subtasks.splice(
    qaIndex,
    1,
    ...dims.map(d => ({ roleType: 'qa' as const, label: d.label, title: d.title, targetFiles: d.files, phase: 2, dependsOn: [] }))
  );
}

export function resolveQaFilesHelper(
  existing: DecomposedSubtask,
  allFiles: string[],
  isSourceFile: (f: string) => boolean
): string[] {
  if (existing.targetFiles.length > 0) return existing.targetFiles;
  const testFiles = allFiles.filter(f => {
    const norm = f.replace(/\\/g, '/').toLowerCase();
    return norm.includes('.test.') || norm.includes('.spec.');
  });
  return testFiles.length >= 2 ? testFiles : allFiles.filter(isSourceFile);
}

export function shardQaByFilesHelper(
  subtasks: DecomposedSubtask[],
  allFiles: string[],
  objective: string,
  allowDimensions: boolean,
  deps: { isSourceFile: (f: string) => boolean; clusterFiles: (files: string[]) => Map<string, string[]> }
): void {
  if (hasDimensionedQaHelper(subtasks)) return;
  const qas = subtasks.filter(t => t.roleType === 'qa');
  if (qas.length !== 1) return;
  const qaIndex = subtasks.findIndex(t => t.roleType === 'qa');
  const qaFiles = resolveQaFilesHelper(qas[0], allFiles, deps.isSourceFile);
  if (qaFiles.length >= 2) {
    const clusterMap = deps.clusterFiles(qaFiles);
    if (clusterMap.size >= 2) {
      const newQas = Array.from(clusterMap.entries()).map(([key, files]) => ({
        roleType: 'qa' as const,
        label: key.slice(0, 15),
        title: `${objective} [QA-${key.slice(0, 15)}]: ${files.slice(0, 2).join(', ')}`,
        targetFiles: files,
        phase: 2,
        dependsOn: []
      }));
      subtasks.splice(qaIndex, 1, ...newQas);
      return;
    }
  }
  if (allowDimensions) {
    const f = allFiles[0];
    const comp = f ? (f.includes('.test.') || f.includes('.spec.') ? f : `${f.replace(/\.[^/.]+$/, '')}.test.ts`) : undefined;
    shardQaByDimensionsHelper(subtasks, objective, comp);
  }
}

export function resolveCompanionSubtasksHelper(
  subtasks: DecomposedSubtask[],
  companionTest: string,
  companionDoc: string,
  objective: string
): DecomposedSubtask[] {
  const others: DecomposedSubtask[] = [];
  let hasDocs = false;
  for (const t of subtasks) {
    if (t.roleType === 'solver') continue;
    if (t.roleType === 'qa') {
      others.push({ ...t, targetFiles: t.targetFiles.length > 0 ? t.targetFiles : [companionTest] });
    } else if (t.roleType === 'docs') {
      hasDocs = true;
      others.push({ ...t, targetFiles: t.targetFiles.length > 0 ? t.targetFiles : [companionDoc] });
    } else {
      others.push(t);
    }
  }
  if (!hasDocs) {
    others.push({ roleType: 'docs', label: 'Docs', title: `${objective} [Spec]: ${companionDoc}`, targetFiles: [companionDoc], phase: 3, dependsOn: ['Audit'] });
  }
  return others;
}
