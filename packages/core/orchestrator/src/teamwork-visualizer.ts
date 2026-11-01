/**
 * @file teamwork-visualizer.ts
 * Visualizers for Antigravity Teamwork: Live Matrix and ASCII Execution Waves DAG.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { TeamworkPlan, TeamworkTrack } from './teamwork-coordinator.js';

export class TeamworkVisualizer {
  public static formatLiveMatrix(
    plan: TeamworkPlan,
    statuses: Record<string, 'running' | 'done' | 'failed' | 'pending' | 'blocked'> = {}
  ): string {
    const lines: string[] = [
      `### 🤖 Antigravity Teamwork Canlı Görev Matrisi [${plan.planId}]`,
      `**Hedef**: ${plan.objective}`,
      '',
      '| Faz | Ajan / Rol | Durum | Bağımlılık | Kilitli Dosyalar | Model |',
      '| :---: | :--- | :--- | :--- | :--- | :--- |'
    ];

    for (const t of plan.tracks) {
      const st = statuses[t.subagentName] ?? statuses[t.roleType] ?? (t.dependsOn.length > 0 ? 'blocked' : 'running');
      const icon = st === 'done'
        ? '✅ Tamamlandı'
        : st === 'failed'
          ? '🛑 Hata'
          : st === 'blocked'
            ? '🔒 Engellendi (Faz)'
            : st === 'pending'
              ? '⏳ Bekliyor'
              : '🔄 Çalışıyor';
      const locks = t.targetFiles.length > 0 ? t.targetFiles.map(f => `\`${f}\``).join(', ') : '-';
      const deps = t.dependsOn.length > 0 ? t.dependsOn.join(', ') : '-';
      lines.push(`| Faz ${t.phase} | \`${t.subagentName}\` | ${icon} | ${deps} | ${locks} | \`${t.invocationPayload.Model}\` |`);
    }

    return lines.join('\n');
  }

  public static formatAsciiDag(plan: TeamworkPlan): string {
    const phases = this.groupTracksByPhase(plan.tracks);
    const sortedPhases = [...phases.keys()].sort((a, b) => a - b);
    const lines: string[] = [
      `### 🌐 Antigravity Teamwork Dalga Bağımlılık Çizelgesi (DAG) [${plan.planId}]`,
      '```text'
    ];

    sortedPhases.forEach((phaseNum, index) => {
      const tracks = phases.get(phaseNum) ?? [];
      const phaseTitle = this.resolvePhaseTitle(phaseNum);
      lines.push(`┌─── ${phaseTitle} ` + '─'.repeat(Math.max(2, 58 - phaseTitle.length)));
      for (const t of tracks) {
        const depStr = t.dependsOn.length > 0 ? ` ── [bağımlı: ${t.dependsOn.join(', ')}]` : '';
        const fileStr = t.targetFiles.length > 0 ? ` (${t.targetFiles.join(', ')})` : '';
        lines.push(`│   • [${t.subagentName}]${fileStr}${depStr}`);
      }
      lines.push('└───' + '─'.repeat(60));

      if (index < sortedPhases.length - 1) {
        lines.push('                  │');
        lines.push('                  ▼  (Önceki faz tamamlanınca açılır)');
      }
    });

    lines.push('```');
    return lines.join('\n');
  }

  private static groupTracksByPhase(tracks: TeamworkTrack[]): Map<number, TeamworkTrack[]> {
    const phases = new Map<number, TeamworkTrack[]>();
    for (const t of tracks) {
      const p = t.phase || 1;
      const list = phases.get(p) ?? [];
      list.push(t);
      phases.set(p, list);
    }
    return phases;
  }

  private static resolvePhaseTitle(phaseNum: number): string {
    if (phaseNum === 1) return '🌊 FAZ 1: Temel Uygulama (Solvers & UI)';
    if (phaseNum === 2) return '🛡️ FAZ 2: Kalite Güvence (QA Hunter & Playtest)';
    return '📚 FAZ 3: Dokümantasyon & Wiki (Doc Architect)';
  }
}
