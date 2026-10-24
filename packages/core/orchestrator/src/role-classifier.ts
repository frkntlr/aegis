export type RoleType = 'solver' | 'qa' | 'docs';

export interface RoleInferenceInput {
  title?: string;
  body?: string;
  labels?: string[];
  targetFiles?: string[];
}

export interface RoleInferenceResult {
  role: RoleType;
  confidence: number;
  reason: string;
  isAmbiguous: boolean;
}

export class RoleClassifier {
  public static readonly CONFIDENCE_THRESHOLD = 60;

  public classify(input: RoleInferenceInput): RoleInferenceResult {
    const scores: Record<RoleType, number> = { solver: 0, qa: 0, docs: 0 };
    const reasons: string[] = [];

    this.evaluateLabels(input.labels || [], scores, reasons);
    this.evaluateTargetFiles(input.targetFiles || [], scores, reasons);
    this.evaluateSemantics(`${input.title || ''} ${input.body || ''}`, scores, reasons);

    const best = this.resolveBestRole(scores);
    const confidence = Math.min(100, Math.max(10, best.score));
    const isAmbiguous = confidence < RoleClassifier.CONFIDENCE_THRESHOLD;

    return {
      role: best.role,
      confidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Varsayılan geliştirici rolü atandı.',
      isAmbiguous
    };
  }

  private evaluateLabels(labels: string[], scores: Record<RoleType, number>, reasons: string[]): void {
    if (labels.length === 0) return;
    const lower = labels.map(l => l.toLowerCase());

    if (lower.some(l => l === 'role:docs' || l === 'documentation' || l === 'docs' || l === 'wiki' || l === 'rfc')) {
      scores.docs += 50;
      reasons.push("Etiket analizi: Dokümantasyon ('docs' / 'wiki' / 'rfc')");
    }
    if (lower.some(l => l === 'role:qa' || l === 'qa' || l === 'test' || l === 'ui' || l === 'layout' || l === 'inspect')) {
      scores.qa += 50;
      reasons.push("Etiket analizi: Test & Arayüz ('qa' / 'test' / 'ui')");
    }
    if (lower.some(l => l === 'role:solver' || l === 'bug' || l === 'fix' || l === 'enhancement' || l === 'refactor')) {
      scores.solver += 50;
      reasons.push("Etiket analizi: Kod Çözümü ('bug' / 'fix' / 'solver')");
    }
  }

  private evaluateTargetFiles(files: string[], scores: Record<RoleType, number>, reasons: string[]): void {
    if (files.length === 0) return;
    let docsHits = 0;
    let qaHits = 0;
    let solverHits = 0;

    for (const f of files) {
      const lower = f.toLowerCase().replace(/\\/g, '/');
      if (lower.endsWith('.md') || lower.includes('/wiki/') || lower.includes('docs/')) docsHits++;
      else if (lower.includes('.test.') || lower.includes('.spec.') || lower.endsWith('.tscn')) qaHits++;
      else if (lower.endsWith('.ts') || lower.endsWith('.py') || lower.endsWith('.gd') || lower.endsWith('.rs')) solverHits++;
    }

    if (docsHits > qaHits && docsHits > solverHits) {
      scores.docs += 35;
      reasons.push(`Dosya analizi: Markdown/Wiki dosyaları (${docsHits} adet)`);
    } else if (qaHits > solverHits) {
      scores.qa += 35;
      reasons.push(`Dosya analizi: Test/Sahne dosyaları (${qaHits} adet)`);
    } else if (solverHits > 0) {
      scores.solver += 35;
      reasons.push(`Dosya analizi: Kaynak kod dosyaları (${solverHits} adet)`);
    }
  }

  private evaluateSemantics(text: string, scores: Record<RoleType, number>, reasons: string[]): void {
    const lower = text.toLowerCase();
    if (!lower.trim()) return;

    const docsKeywords = ['doküman', 'document', 'wiki', 'rehber', 'guide', 'rfc', 'mimari'];
    const qaKeywords = ['test et', 'denetle', 'inspect', 'boundingbox', 'visual', 'görsel', 'layout', 'ui'];
    const solverKeywords = ['çöz', 'onarım', 'fix', 'bug', 'hata', 'implement', 'algorithm', 'refactor'];

    if (docsKeywords.some(k => lower.includes(k))) {
      scores.docs += 15;
      reasons.push('Metin analizi: Dokümantasyon anahtar kelimeleri');
    }
    if (qaKeywords.some(k => lower.includes(k))) {
      scores.qa += 15;
      reasons.push('Metin analizi: Test & Denetim anahtar kelimeleri');
    }
    if (solverKeywords.some(k => lower.includes(k))) {
      scores.solver += 15;
      reasons.push('Metin analizi: Hata onarımı anahtar kelimeleri');
    }
  }

  private resolveBestRole(scores: Record<RoleType, number>): { role: RoleType; score: number } {
    let bestRole: RoleType = 'solver';
    let maxScore = scores.solver;

    if (scores.qa > maxScore) {
      bestRole = 'qa';
      maxScore = scores.qa;
    }
    if (scores.docs > maxScore) {
      bestRole = 'docs';
      maxScore = scores.docs;
    }
    // If tie or all zero, solver is default
    if (maxScore === 0) {
      return { role: 'solver', score: 30 };
    }
    return { role: bestRole, score: maxScore };
  }
}
