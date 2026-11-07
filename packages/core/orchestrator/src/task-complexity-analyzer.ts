/**
 * @file task-complexity-analyzer.ts
 * Autonomously evaluates task complexity, scope, and blast radius to dynamically
 * size agent swarms without manual developer intervention.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';

export type ComplexityTier = 'TRIVIAL' | 'MODERATE' | 'COMPLEX' | 'HYPER_SCALE';

export interface ComplexityAnalysisResult {
  tier: ComplexityTier;
  score: number;
  optimalAgentCount: number;
  shouldEnableHierarchicalTree: boolean;
  reasons: string[];
  suggestedRoles: RoleType[];
}

const TRIVIAL_KEYWORDS = ['typo', 'rename', 'comment', 'docstring', 'readme', 'format', 'lint', 'yazım', 'formatla'];
const HYPER_KEYWORDS = [
  'monorepo', 'overhaul', 'massive', 'migration', 'hierarchical', 'swarm', 'hyper', 'complete rewrite',
  'çoklu ajan', 'coklu ajan', 'hiyerarşik', 'hiyerarsik', 'sürü', 'suru', 'ölçek', 'olcek', 'tüm proje'
];
const COMPLEX_KEYWORDS = [
  'feature', 'pipeline', 'integrate', 'controller', 'bridge', 'state', 'worker', 'scanner', 'adapter',
  'analiz', 'araştırma', 'arastirma', 'eş zamanlı', 'es zamanli', 'paralel', 'optimizasyon', 'geliştirme',
  'dinamik ajan', 'çoklu'
];

export class TaskComplexityAnalyzer {
  private static scoreObjective(objective: string): { score: number; reasons: string[]; isTrivial: boolean } {
    const lower = objective.toLowerCase();
    const reasons: string[] = [];
    let score = 20;

    const trivialMatch = TRIVIAL_KEYWORDS.find(k => lower.includes(k));
    if (trivialMatch && lower.split(/\s+/).length < 8) {
      reasons.push(`Basit/Tekil işlem anahtar kelimesi: '${trivialMatch}'`);
      return { score: 10, reasons, isTrivial: true };
    }

    const hyperMatch = HYPER_KEYWORDS.filter(k => lower.includes(k));
    if (hyperMatch.length > 0) {
      score += Math.min(40, hyperMatch.length * 25);
      reasons.push(`Geniş mimari kapsam (${hyperMatch.join(', ')})`);
    }

    const complexMatch = COMPLEX_KEYWORDS.filter(k => lower.includes(k));
    if (complexMatch.length > 0) {
      score += Math.min(20, complexMatch.length * 10);
      reasons.push(`Karmaşık bileşen entegrasyonu (${complexMatch.join(', ')})`);
    }

    const wordCount = lower.split(/\s+/).length;
    if (wordCount > 15) {
      score += 10;
      reasons.push(`Detaylı görev spesifikasyonu (${wordCount} kelime)`);
    }

    return { score, reasons, isTrivial: false };
  }

  private static extractDomains(files: string[]): string[] {
    const domains = new Set<string>();
    for (const f of files) {
      const normalized = f.replace(/\\/g, '/');
      const mPkg = normalized.match(/packages\/([^/]+)/);
      if (mPkg) domains.add(`pkg:${mPkg[1]}`);
      if (normalized.endsWith('.tscn') || normalized.endsWith('.gd') || normalized.includes('ui/')) domains.add('ui');
      if (normalized.includes('test') || normalized.includes('spec')) domains.add('test');
      if (normalized.endsWith('.md') || normalized.includes('docs/')) domains.add('docs');
    }
    return Array.from(domains);
  }

  private static scoreFiles(files: string[]): { score: number; reasons: string[]; domains: string[] } {
    const reasons: string[] = [];
    const domains = this.extractDomains(files);
    let score = 0;

    if (files.length === 0) {
      return { score: 0, reasons: ['Belirtilmiş hedef dosya yok (otomatik keşif)'], domains };
    }
    if (files.length === 1) {
      score += 5;
      reasons.push('Tek dosya hedefi');
    } else if (files.length <= 4) {
      score += 15;
      reasons.push(`${files.length} hedef dosya`);
    } else if (files.length <= 8) {
      score += 30;
      reasons.push(`${files.length} hedef dosya geniş etki alanı`);
    } else {
      score += 45;
      reasons.push(`${files.length} hedef dosya (yüksek etki yarıçapı)`);
    }

    if (domains.length >= 3) {
      score += 20;
      reasons.push(`Çoklu etki alanı (${domains.join(', ')})`);
    } else if (domains.length === 2) {
      score += 10;
      reasons.push(`İki bağımsız alan (${domains.join(', ')})`);
    }

    return { score, reasons, domains };
  }

  private static resolveRoles(tier: ComplexityTier, objective: string, domains: string[]): RoleType[] {
    const lower = objective.toLowerCase();
    const hasUi = domains.includes('ui') || lower.includes('ui') || lower.includes('arayüz') || lower.includes('theme');
    const hasDocOnly = (domains.includes('docs') || lower.includes('readme') || lower.includes('doc')) && domains.length <= 1;

    if (tier === 'TRIVIAL') {
      if (hasDocOnly) return ['docs'];
      if (hasUi) return ['ui'];
      return ['solver'];
    }
    if (tier === 'MODERATE') {
      return hasUi ? ['ui', 'qa'] : ['solver', 'qa'];
    }
    return ['solver', 'ui', 'qa', 'docs'];
  }

  public static analyze(objective: string, files: string[] = []): ComplexityAnalysisResult {
    const objScore = this.scoreObjective(objective);
    const fileScore = this.scoreFiles(files);
    const rawScore = objScore.isTrivial && files.length <= 1 ? 15 : Math.min(100, objScore.score + fileScore.score);
    const reasons = [...objScore.reasons, ...fileScore.reasons];

    let tier: ComplexityTier = 'MODERATE';
    let optimalAgentCount = 2;
    let shouldEnableHierarchicalTree = false;

    if (rawScore <= 25) {
      tier = 'TRIVIAL';
      optimalAgentCount = 1;
    } else if (rawScore <= 50) {
      tier = 'MODERATE';
      optimalAgentCount = 2;
    } else if (rawScore <= 75) {
      tier = 'COMPLEX';
      optimalAgentCount = 4;
      shouldEnableHierarchicalTree = fileScore.domains.length >= 2 || files.length >= 4;
    } else {
      tier = 'HYPER_SCALE';
      optimalAgentCount = Math.min(12, Math.max(8, files.length > 0 ? files.length : 8));
      shouldEnableHierarchicalTree = true;
    }

    const suggestedRoles = this.resolveRoles(tier, objective, fileScore.domains);
    return { tier, score: rawScore, optimalAgentCount, shouldEnableHierarchicalTree, reasons, suggestedRoles };
  }

  public static formatRadar(result: ComplexityAnalysisResult): string {
    const icon = result.tier === 'HYPER_SCALE' ? '⚡' : result.tier === 'COMPLEX' ? '🔷' : result.tier === 'MODERATE' ? '🔹' : '⚪';
    const lines = [
      `${icon} **Otonom Görev Karmaşıklık Radarı** [${result.tier}] (Skor: ${result.score}/100)`,
      ` • **Önerilen / Tahsis Edilen Ajan Sayısı:** ${result.optimalAgentCount} Ajan`,
      ` • **Hiyerarşik Ağaç / Mikro-Uzmanlar:** ${result.shouldEnableHierarchicalTree ? '✅ Aktif' : '⚪ Pasif (Doğrusal Akış)'}`,
      ` • **Etki Faktörleri:** ${result.reasons.join(' | ')}`
    ];
    return lines.join('\n');
  }
}
