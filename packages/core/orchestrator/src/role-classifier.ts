export type RoleType = 'solver' | 'qa' | 'docs' | 'ui';

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

interface FileHits {
  docs: number;
  ui: number;
  qa: number;
  solver: number;
}

export class RoleClassifier {
  public static readonly CONFIDENCE_THRESHOLD = 60;

  public static isUiFile(filePath: string): boolean {
    const lower = filePath.toLowerCase().replace(/\\/g, '/');
    if (lower.endsWith('.tres') || lower.endsWith('.theme') || lower.includes('/theme/') || lower.includes('/themes/')) {
      return true;
    }
    const isUiNamed = lower.includes('/ui/') || lower.includes('menu') || lower.includes('hud') ||
      lower.includes('dialog') || lower.includes('screen') || lower.includes('modal') ||
      lower.includes('widget') || lower.includes('popup') || lower.includes('toast') ||
      lower.includes('button') || lower.includes('toolbar') || lower.includes('window');
    return (lower.endsWith('.tscn') || lower.endsWith('.gd')) && isUiNamed;
  }

  public classify(input: RoleInferenceInput): RoleInferenceResult {
    const scores: Record<RoleType, number> = { solver: 0, qa: 0, docs: 0, ui: 0 };
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
    if (lower.some(l => l === 'role:ui' || l === 'theme' || l === 'styles' || l === 'design' || l === 'ui' || l === 'godot-ui')) {
      scores.ui += 50;
      reasons.push("Etiket analizi: UI & Tema ('role:ui' / 'theme' / 'styles' / 'ui')");
    }
    if (lower.some(l => l === 'role:qa' || l === 'qa' || l === 'test' || l === 'inspect')) {
      scores.qa += 50;
      reasons.push("Etiket analizi: Test & Denetim ('qa' / 'test')");
    }
    if (lower.some(l => l === 'role:solver' || l === 'bug' || l === 'fix' || l === 'enhancement' || l === 'refactor')) {
      scores.solver += 50;
      reasons.push("Etiket analizi: Kod Çözümü ('bug' / 'fix' / 'solver')");
    }
  }

  private countFileHits(files: string[]): FileHits {
    const hits: FileHits = { docs: 0, ui: 0, qa: 0, solver: 0 };
    for (const f of files) {
      const lower = f.toLowerCase().replace(/\\/g, '/');
      if (lower.endsWith('.md') || lower.includes('/wiki/') || lower.includes('docs/')) {
        hits.docs++;
      } else if (RoleClassifier.isUiFile(f)) {
        hits.ui++;
      } else if (lower.includes('.test.') || lower.includes('.spec.') || lower.endsWith('.tscn')) {
        hits.qa++;
      } else if (lower.endsWith('.ts') || lower.endsWith('.py') || lower.endsWith('.gd') || lower.endsWith('.rs')) {
        hits.solver++;
      }
    }
    return hits;
  }

  private evaluateTargetFiles(files: string[], scores: Record<RoleType, number>, reasons: string[]): void {
    if (files.length === 0) return;
    const h = this.countFileHits(files);
    const isExclDocs = h.docs > 0 && h.ui === 0 && h.qa === 0 && h.solver === 0;
    const isExclUi = h.ui > 0 && h.docs === 0 && h.qa === 0 && h.solver === 0;
    const isExclQa = h.qa > 0 && h.docs === 0 && h.ui === 0 && h.solver === 0;
    const isExclSolver = h.solver > 0 && h.docs === 0 && h.ui === 0 && h.qa === 0;

    if (h.docs > h.qa && h.docs > h.solver && h.docs > h.ui) {
      scores.docs += isExclDocs ? 45 : 35;
      reasons.push(`Dosya analizi: Markdown/Wiki dosyaları (${h.docs} adet)`);
    } else if (h.ui > 0 && h.ui >= h.qa && h.ui >= h.solver) {
      scores.ui += isExclUi ? 45 : 35;
      reasons.push(`Dosya analizi: Tema/Arayüz dosyaları (${h.ui} adet)`);
    } else if (h.qa > h.solver) {
      scores.qa += isExclQa ? 45 : 35;
      reasons.push(`Dosya analizi: Test/Sahne dosyaları (${h.qa} adet)`);
    } else if (h.solver > 0) {
      scores.solver += isExclSolver ? 45 : 35;
      reasons.push(`Dosya analizi: Kaynak kod dosyaları (${h.solver} adet)`);
    }
  }

  private evaluateSemantics(text: string, scores: Record<RoleType, number>, reasons: string[]): void {
    const lower = text.toLowerCase();
    if (!lower.trim()) return;

    const docsKeywords = ['doküman', 'document', 'wiki', 'rehber', 'guide', 'rfc', 'mimari'];
    const uiKeywords = [
      'tema', 'theme', 'stylebox', 'font', 'renk', 'color', 'stil', 'tasarım',
      'container', 'margin', 'responsive', 'ui', 'godot ui', 'menu', 'menü',
      'hud', 'dialog', 'diyalog', 'button', 'buton', 'label', 'layout',
      'anchor', 'control', 'canvas', 'screen', 'ekran', 'arayüz', 'widget'
    ];
    const qaKeywords = ['test et', 'denetle', 'inspect', 'boundingbox', 'visual', 'görsel', 'layout', 'telemetry', 'playtest', 'aspect ratio'];
    const solverKeywords = ['çöz', 'onarım', 'fix', 'bug', 'hata', 'implement', 'algorithm', 'refactor', 'mutation', 'demir kafes'];

    this.matchKeywords(lower, docsKeywords, 'docs', scores, reasons, 'Dokümantasyon');
    this.matchKeywords(lower, uiKeywords, 'ui', scores, reasons, 'UI & Tema');
    this.matchKeywords(lower, qaKeywords, 'qa', scores, reasons, 'Test & Denetim');
    this.matchKeywords(lower, solverKeywords, 'solver', scores, reasons, 'Hata onarımı');
  }

  private matchKeywords(text: string, words: string[], role: RoleType, scores: Record<RoleType, number>, reasons: string[], label: string): void {
    const matches = words.filter(k => text.includes(k));
    if (matches.length > 0) {
      scores[role] += matches.length > 1 ? 25 : 15;
      reasons.push(`Metin analizi: ${label} anahtar kelimeleri`);
    }
  }

  private resolveBestRole(scores: Record<RoleType, number>): { role: RoleType; score: number } {
    let bestRole: RoleType = 'solver';
    let maxScore = scores.solver;

    if (scores.qa > maxScore) {
      bestRole = 'qa';
      maxScore = scores.qa;
    }
    if (scores.ui > maxScore) {
      bestRole = 'ui';
      maxScore = scores.ui;
    }
    if (scores.docs > maxScore) {
      bestRole = 'docs';
      maxScore = scores.docs;
    }
    if (maxScore === 0) {
      return { role: 'solver', score: 30 };
    }
    return { role: bestRole, score: maxScore };
  }
}
