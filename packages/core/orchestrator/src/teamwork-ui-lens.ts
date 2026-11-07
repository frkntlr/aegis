/**
 * @file teamwork-ui-lens.ts
 * Deep UI & Presentation Inspection Lens for Godot 4 scenes and Web interfaces.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AnalysisInsight,
  LensExecutionResult
} from './teamwork-analysis-types.js';

export class UiVisualLayoutLens {
  public static async execute(repoRoot: string, files: string[]): Promise<LensExecutionResult> {
    return this.executeSync(repoRoot, files);
  }

  public static executeSync(repoRoot: string, files: string[]): LensExecutionResult {
    const start = Date.now();
    const insights: AnalysisInsight[] = [];
    const uiFiles = this.collectUiFiles(repoRoot, files);

    for (const rel of uiFiles.slice(0, 15)) {
      const full = path.join(repoRoot, rel);
      if (!fs.existsSync(full)) continue;
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (rel.endsWith('.tscn')) {
          this.inspectGodotScene(rel, content, insights);
        } else if (rel.endsWith('.tsx') || rel.endsWith('.html') || rel.endsWith('.css')) {
          this.inspectWebUi(rel, content, insights);
        }
      } catch { /* ignore read errors */ }
    }

    return { lens: 'ui', agent: 'ui-specialist', durationMs: Date.now() - start, insights };
  }

  private static collectUiFiles(repoRoot: string, files: string[]): string[] {
    const matched = files.filter(f =>
      f.endsWith('.tscn') || f.endsWith('.tres') || f.endsWith('.tsx') || f.endsWith('.css') || f.endsWith('.html')
    );
    if (matched.length > 0) return matched;

    const discovered: string[] = [];
    const searchDirs = ['scenes', 'ui', 'src/ui', 'packages/services/web-dashboard'];
    for (const dir of searchDirs) {
      const full = path.join(repoRoot, dir);
      if (fs.existsSync(full)) {
        try {
          const entries = fs.readdirSync(full).map(f => path.join(dir, f).replace(/\\/g, '/'));
          discovered.push(...entries.filter(f => f.endsWith('.tscn') || f.endsWith('.tsx') || f.endsWith('.html')));
        } catch { /* ignore */ }
      }
    }
    return discovered;
  }

  private static inspectGodotScene(rel: string, content: string, insights: AnalysisInsight[]): void {
    const lines = content.split('\n');
    const hasPreset15 = content.includes('anchors_preset = 15');
    const isControlRoot = content.includes('type="Control"') || content.includes('type="CanvasLayer"');

    if (isControlRoot && !hasPreset15) {
      insights.push({
        id: `ui-preset-${rel}`, lens: 'ui', agent: 'ui-specialist',
        category: 'responsive_risk', severity: 'high', target: rel,
        finding: `Root UI control in '${rel}' does not define anchors_preset = 15 (Full Rect).`,
        actionableStep: 'Define anchors_preset = 15 with grow_horizontal = 2, grow_vertical = 2 for responsive viewport adaptation.',
        timestamp: new Date().toISOString()
      });
    }

    this.checkGodotTouchTargets(rel, lines, insights);
  }

  private static checkGodotTouchTargets(rel: string, lines: string[], insights: AnalysisInsight[]): void {
    let inButton = false;
    let hasMinSize = false;

    for (const line of lines) {
      if (line.includes('type="Button"') || line.includes('type="CheckButton"') || line.includes('type="TextureButton"')) {
        if (inButton && !hasMinSize) {
          this.pushTouchTargetInsight(rel, insights);
        }
        inButton = true;
        hasMinSize = false;
      } else if (inButton && line.startsWith('[')) {
        if (!hasMinSize) {
          this.pushTouchTargetInsight(rel, insights);
        }
        inButton = false;
      } else if (inButton && line.includes('custom_minimum_size = Vector2(')) {
        hasMinSize = true;
      }
    }
    if (inButton && !hasMinSize) {
      this.pushTouchTargetInsight(rel, insights);
    }
  }

  private static pushTouchTargetInsight(rel: string, insights: AnalysisInsight[]): void {
    insights.push({
      id: `ui-touch-${rel}-${insights.length}`,
      lens: 'ui',
      agent: 'ui-specialist',
      category: 'ui_defect',
      severity: 'medium',
      target: rel,
      finding: `Interactive button control in '${rel}' lacks explicit minimum 44x44px touch target.`,
      actionableStep: 'Add custom_minimum_size = Vector2(44, 44) to ensure mobile compliance and touch accessibility.',
      timestamp: new Date().toISOString()
    });
  }

  private static inspectWebUi(rel: string, content: string, insights: AnalysisInsight[]): void {
    if (content.includes('width: 1200px') || content.includes('width: 1400px')) {
      insights.push({
        id: `ui-web-${rel}`, lens: 'ui', agent: 'ui-specialist',
        category: 'responsive_risk', severity: 'medium', target: rel,
        finding: `Fixed desktop pixel width detected in '${rel}' without responsive container.`,
        actionableStep: 'Replace hardcoded desktop width with max-width: 100% and flexbox/grid layout.',
        timestamp: new Date().toISOString()
      });
    }
  }
}
