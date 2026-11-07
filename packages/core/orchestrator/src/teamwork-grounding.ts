/**
 * @file teamwork-grounding.ts
 * Zero-Hallucination Grounding Engine for Antigravity Teamwork.
 * Injects immutable AST skeletons, line budgets, and upstream contracts into prompts.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { SkeletonGenerator } from '@aegis/ast-skeleton';

export interface FileGroundingReport {
  filePath: string;
  exists: boolean;
  lineCount: number;
  headroom: number;
  budgetStatus: 'healthy' | 'warning' | 'critical';
  skeleton: string;
  tokenSavingsPercent: number;
}

export class TeamworkGroundingEngine {
  private repoRoot: string;
  private skeletonGen: SkeletonGenerator;
  private fileCache = new Map<string, { mtimeMs: number; size: number; report: FileGroundingReport }>();

  constructor(repoRoot?: string, skeletonGen?: SkeletonGenerator) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.skeletonGen = skeletonGen ?? new SkeletonGenerator();
  }

  public resolvePath(targetPath: string): string {
    if (path.isAbsolute(targetPath)) return targetPath;
    return path.resolve(this.repoRoot, targetPath);
  }

  public inspectFile(relPath: string): FileGroundingReport {
    const fullPath = this.resolvePath(relPath);
    if (!fs.existsSync(fullPath)) {
      return {
        filePath: relPath, exists: false, lineCount: 0,
        headroom: 300, budgetStatus: 'healthy', skeleton: '', tokenSavingsPercent: 0
      };
    }

    try {
      const stat = fs.statSync(fullPath);
      const cached = this.fileCache.get(relPath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.report;
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n').length;
      const headroom = Math.max(0, 300 - lines);
      const budgetStatus: FileGroundingReport['budgetStatus'] = lines >= 280 ? 'critical' : lines >= 240 ? 'warning' : 'healthy';
      const extRes = this.skeletonGen.extractFile(relPath, content);
      const report: FileGroundingReport = {
        filePath: relPath, exists: true, lineCount: lines, headroom,
        budgetStatus, skeleton: this.trimSkeleton(extRes.skeletonContent),
        tokenSavingsPercent: extRes.tokenSavingsPercent
      };
      this.fileCache.set(relPath, { mtimeMs: stat.mtimeMs, size: stat.size, report });
      return report;
    } catch {
      return { filePath: relPath, exists: false, lineCount: 0, headroom: 300, budgetStatus: 'healthy', skeleton: '', tokenSavingsPercent: 0 };
    }
  }

  private trimSkeleton(skel: string, maxLines = 35): string {
    const lines = skel.trim().split('\n');
    if (lines.length <= maxLines) return skel.trim();
    return lines.slice(0, maxLines).join('\n') + '\n// ... (additional members truncated for prompt economy)';
  }

  private resolveStatusIcon(status: FileGroundingReport['budgetStatus']): string {
    if (status === 'critical') return '🔴 Critical Headroom (Modular Extraction Required)';
    if (status === 'warning') return '🟡 Approaching Limit (Extract Helpers)';
    return '🟢 Healthy Headroom';
  }

  private resolveCodeFenceLang(filePath: string): string {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.gd')) return 'gdscript';
    if (filePath.endsWith('.tscn')) return 'ini';
    if (filePath.endsWith('.json')) return 'json';
    return 'text';
  }

  public buildAnalysisMeshGrounding(targetFiles: string[]): string {
    if (!targetFiles || targetFiles.length === 0) return '';
    try {
      const meshPath = path.join(this.repoRoot, '.aegis', 'analysis-mesh.json');
      if (!fs.existsSync(meshPath)) return '';
      const raw = fs.readFileSync(meshPath, 'utf8');
      const state = JSON.parse(raw);
      const allInsights = Object.values(state.insights || {}) as Array<{ target: string; lens: string; severity: string; finding: string; actionableStep?: string }>;
      const relevant = allInsights.filter(i => targetFiles.some(tf => tf.includes(i.target) || i.target.includes(tf)));
      if (relevant.length === 0) return '';
      const lines = ['### 🧠 Swarm Working Memory & Pre-Flight Analysis Insights'];
      for (const item of relevant.slice(0, 4)) {
        lines.push(`- **[${item.lens.toUpperCase()}]** (${item.severity}): ${item.finding}`);
        if (item.actionableStep) lines.push(`  *Action*: ${item.actionableStep}`);
      }
      return lines.join('\n');
    } catch {
      return '';
    }
  }

  public buildGroundingSection(targetFiles: string[]): string {
    if (!targetFiles || targetFiles.length === 0) return '';
    const reports = targetFiles.map(f => this.inspectFile(f));
    const lines: string[] = ['### 🛡️ Ground-Truth Codebase Reality (Zero-Hallucination)'];

    for (const r of reports) {
      if (!r.exists) {
        lines.push(`- \`${r.filePath}\`: (New File to Create - Max 300 lines, 0 any)`);
        continue;
      }
      const icon = this.resolveStatusIcon(r.budgetStatus);
      lines.push(`- \`${r.filePath}\` (Lines: ${r.lineCount}/300, Headroom: ${r.headroom} lines | ${icon}):`);
      if (r.skeleton.trim().length > 0) {
        const lang = this.resolveCodeFenceLang(r.filePath);
        lines.push(`\`\`\`${lang}\n${r.skeleton}\n\`\`\``);
      }
    }
    const meshGrounding = this.buildAnalysisMeshGrounding(targetFiles);
    if (meshGrounding) lines.push('\n' + meshGrounding);
    return lines.join('\n');
  }

  public buildUpstreamContractsSection(
    upstreamItems: Array<{ subagentName: string; files: string[] }>
  ): string {
    if (!upstreamItems || upstreamItems.length === 0) return '';
    const lines: string[] = ['### 🔗 Upstream Dependency Contracts (Verified Interfaces)'];
    let count = 0;

    for (const item of upstreamItems) {
      for (const f of item.files) {
        const rep = this.inspectFile(f);
        if (rep.exists && rep.skeleton.trim().length > 0) {
          count++;
          const lang = this.resolveCodeFenceLang(f);
          lines.push(`- Upstream Export from \`${item.subagentName}\` (\`${f}\`):`);
          lines.push(`\`\`\`${lang}\n${rep.skeleton}\n\`\`\``);
        }
      }
    }
    return count > 0 ? lines.join('\n') : '';
  }
}
