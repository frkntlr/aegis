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

interface KeywordMatchOptions {
  text: string;
  words: readonly string[];
  role: RoleType;
  scores: Record<RoleType, number>;
  reasons: string[];
  label: string;
}

interface FileRoleRule {
  role: RoleType;
  matches: (hits: FileHits) => boolean;
  reason: (count: number) => string;
}

const UI_THEME_EXTS = ['.tres', '.theme'] as const;
const UI_THEME_DIRS = ['/theme/', '/themes/'] as const;
const UI_SCRIPT_EXTS = ['.tscn', '.gd'] as const;
const UI_NAME_MARKERS = [
  '/ui/', 'menu', 'hud', 'dialog', 'screen', 'modal',
  'widget', 'popup', 'toast', 'button', 'toolbar', 'window'
] as const;

const FILE_ROLE_RULES: readonly FileRoleRule[] = [
  {
    role: 'docs',
    matches: h => h.docs > h.qa && h.docs > h.solver && h.docs > h.ui,
    reason: count => `Dosya analizi: Markdown/Wiki dosyaları (${count} adet)`
  },
  {
    role: 'ui',
    matches: h => h.ui > 0 && h.ui >= h.qa && h.ui >= h.solver,
    reason: count => `Dosya analizi: Tema/Arayüz dosyaları (${count} adet)`
  },
  {
    role: 'qa',
    matches: h => h.qa > h.solver,
    reason: count => `Dosya analizi: Test/Sahne dosyaları (${count} adet)`
  },
  {
    role: 'solver',
    matches: h => h.solver > 0,
    reason: count => `Dosya analizi: Kaynak kod dosyaları (${count} adet)`
  }
];

export class RoleClassifier {
  public static readonly CONFIDENCE_THRESHOLD = 60;

  public static isUiFile(filePath: string): boolean {
    const lower = filePath.toLowerCase().replace(/\\/g, '/');
    if (UI_THEME_EXTS.some(ext => lower.endsWith(ext))) return true;
    if (UI_THEME_DIRS.some(dir => lower.includes(dir))) return true;
    if (!UI_SCRIPT_EXTS.some(ext => lower.endsWith(ext))) return false;
    return UI_NAME_MARKERS.some(marker => lower.includes(marker));
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

  private isExclusiveHit(hits: FileHits, role: RoleType): boolean {
    const total = hits.docs + hits.ui + hits.qa + hits.solver;
    return hits[role] > 0 && hits[role] === total;
  }

  private evaluateTargetFiles(files: string[], scores: Record<RoleType, number>, reasons: string[]): void {
    if (files.length === 0) return;
    const hits = this.countFileHits(files);
    const rule = FILE_ROLE_RULES.find(r => r.matches(hits));
    if (!rule) return;
    const points = this.isExclusiveHit(hits, rule.role) ? 45 : 35;
    scores[rule.role] += points;
    reasons.push(rule.reason(hits[rule.role]));
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

    this.matchKeywords({ text: lower, words: docsKeywords, role: 'docs', scores, reasons, label: 'Dokümantasyon' });
    this.matchKeywords({ text: lower, words: uiKeywords, role: 'ui', scores, reasons, label: 'UI & Tema' });
    this.matchKeywords({ text: lower, words: qaKeywords, role: 'qa', scores, reasons, label: 'Test & Denetim' });
    this.matchKeywords({ text: lower, words: solverKeywords, role: 'solver', scores, reasons, label: 'Hata onarımı' });
  }

  private matchKeywords(opts: KeywordMatchOptions): void {
    const matches = opts.words.filter(k => opts.text.includes(k));
    if (matches.length === 0) return;
    opts.scores[opts.role] += matches.length > 1 ? 25 : 15;
    opts.reasons.push(`Metin analizi: ${opts.label} anahtar kelimeleri`);
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
