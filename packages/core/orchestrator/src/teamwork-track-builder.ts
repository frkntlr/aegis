/**
 * @file teamwork-track-builder.ts
 * Builds grounded Antigravity subagent tracks, deterministic IDs and prompt payloads.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as crypto from 'node:crypto';
import type { RoleType } from './role-classifier.js';
import {
  type SubagentProfile,
  compileTrackPrompt
} from './teamwork-prompts.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';
import type { TeamworkGroundingEngine } from './teamwork-grounding.js';
import type { TeamworkTrack } from './teamwork-types.js';
import { ROLE_SPECIALISTS } from './teamwork-hierarchical-tree.js';
import { buildCodexInvocation } from './codex-teamwork.js';

export class TeamworkTrackBuilder {
  public static hashPlan(objective: string, files: string[]): string {
    const sorted = [...files].sort().join(',');
    return crypto.createHash('sha256').update(`${objective.trim()}::${sorted}`).digest('hex').slice(0, 10);
  }

  private static enrichQaContracts(
    baseContracts: string,
    upstreamItems: Array<{ subagentName: string; files: string[] }>
  ): string {
    const fileEntries = upstreamItems
      .filter(item => item.files.length > 0)
      .map(item => `  * [${item.subagentName}] -> ${item.files.map(f => `\`${f}\``).join(', ')}`);

    const header = [
      '### 🎯 QA Hunter Cerrahi Odak & Üst Akış (Faz 1) Doğrulama Kapsamı',
      '- Bağlam Şişmesini Önleme: Tüm dosyaları baştan sona okumak yerine yalnızca üst akış (Faz 1) çözücülerin değiştirdiği fonksiyon ve sözleşmelere cerrahi odaklan.',
      fileEntries.length > 0
        ? `- Denetlenecek Üst Akış Değişiklikleri:\n${fileEntries.join('\n')}`
        : '- Üst Akış Sözleşmeleri: Faz 1 çıktılarındaki export imzalarını ve tip arayüzlerini doğrula.',
      '- Cerrahi Görev: Yukarıdaki AST sözleşmelerini referans alarak uç durum testleri (edge cases) kurgula ve `aegis verify:task` ile onayla.'
    ].join('\n');

    return baseContracts ? `${header}\n\n${baseContracts}` : header;
  }

  private static enrichQaGrounding(baseGrounding: string): string {
    const note = [
      '### 🔬 QA Cerrahi Zemin & Bağlam Yönergesi',
      '- Tam Dosya Taramasından Kaçınma: Dosya içeriğini baştan sona bağlama çekmek token maliyetini artırır ve gecikmeye neden olur.',
      '- Cerrahi İnceleme: Yalnızca değişen metod gövdelerini ve hedef test dosyalarını inceleyin, hataları kanıt temelli (`aegis triage`, `aegis debug`) analiz edin.'
    ].join('\n');

    return baseGrounding ? `${baseGrounding}\n\n${note}` : note;
  }

  private static sanitizeQaContracts(roleType: RoleType, upstreamContracts?: string): string | undefined {
    if (roleType !== 'qa' || !upstreamContracts) return upstreamContracts;
    if (upstreamContracts.includes('QA Hunter Cerrahi Odak')) return upstreamContracts;
    return `### 🎯 QA Hunter Cerrahi Odak & Üst Akış (Faz 1) Doğrulama Kapsamı\n- Üst akış çözücülerin sözleşmelerine cerrahi odaklanın.\n\n${upstreamContracts}`;
  }

  public static buildSubtaskTrack(
    sub: DecomposedSubtask,
    profiles: SubagentProfile[],
    upstreamFilesMap: Map<string, string[]>,
    isDet: boolean,
    groundingEngine: TeamworkGroundingEngine
  ): TeamworkTrack {
    const profile = profiles.find(p => p.roleType === sub.roleType) ?? profiles[0];
    const baseGrounding = groundingEngine.buildGroundingSection(sub.targetFiles);
    const resolvedDeps = (sub.dependsOn && sub.dependsOn.length > 0)
      ? sub.dependsOn
      : (sub.roleType === 'qa' ? Array.from(upstreamFilesMap.keys()) : []);
    const upstreamItems = resolvedDeps.map(dep => ({
      subagentName: dep,
      files: upstreamFilesMap.get(dep) ?? []
    }));
    const baseContracts = groundingEngine.buildUpstreamContractsSection(upstreamItems);
    const grounding = sub.roleType === 'qa' ? this.enrichQaGrounding(baseGrounding) : baseGrounding;
    const upstreamContracts = sub.roleType === 'qa' ? this.enrichQaContracts(baseContracts, upstreamItems) : baseContracts;

    return this.buildTrack(
      sub.roleType,
      profile,
      sub.title,
      sub.targetFiles,
      sub.label,
      isDet,
      resolvedDeps,
      sub.phase ?? 1,
      grounding,
      upstreamContracts
    );
  }

  public static buildTrack(
    roleType: RoleType,
    profile: SubagentProfile,
    desc: string,
    files: string[],
    label: string,
    deterministic = false,
    dependsOn: string[] = [],
    phase = 1,
    groundingContext?: string,
    upstreamContracts?: string
  ): TeamworkTrack {
    const subagentName = `${profile.name} [${label}]`;
    const id = deterministic
      ? `${roleType}-${label.toLowerCase()}-${crypto.createHash('sha256').update(`${desc}:${[...files].sort().join(',')}`).digest('hex').slice(0, 6)}`
      : `${roleType}-${label.toLowerCase()}-${Date.now().toString(36)}`;
    const contracts = this.sanitizeQaContracts(roleType, upstreamContracts);
    const prompt = compileTrackPrompt(profile, desc, files, subagentName, dependsOn, phase, groundingContext, contracts);
    const spec = ROLE_SPECIALISTS[roleType]?.find(s => s.label.toLowerCase() === label.toLowerCase());
    const assignedAegisTools = spec ? spec.assignedTools : (profile.aegisTools ?? []);
    return {
      id, roleType, subagentName,
      title: `${profile.title} [${label}]`,
      targetFiles: files,
      prompt,
      dependsOn,
      phase,
      assignedAegisTools,
      codexInvocationPayload: buildCodexInvocation({ id, title: desc, targetFiles: files, dependsOn, phase, roleType }, desc,
        [groundingContext, contracts, `Assigned Aegis tools: ${assignedAegisTools.join(', ')}`].filter(Boolean).join('\n')),
      invocationPayload: {
        TypeName: profile.name,
        Role: `${profile.title} - ${label}`,
        Prompt: prompt,
        Workspace: profile.workspaceMode ?? 'inherit',
        Model: profile.defaultModel ?? 'inherit'
      }
    };
  }
}
