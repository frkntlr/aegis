/**
 * @file teamwork-grounding.ts
 * Bounded source grounding for teamwork prompts.
 * Injects partial AST snapshots, line budgets, and upstream context into prompts.
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
  unavailable?: boolean;
}

export class TeamworkGroundingEngine {
  private repoRoot: string;
  private skeletonGen: SkeletonGenerator;
  private fileCache = new Map<string, { stamp: string; report: FileGroundingReport }>();

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
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return this.unavailableReport(relPath, true);
      const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
      const key = this.cacheKey(fullPath);
      const cached = this.fileCache.get(key);
      if (cached?.stamp === stamp) return { ...cached.report, filePath: relPath };
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
      this.fileCache.set(key, { stamp, report });
      return { ...report };
    } catch (error) {
      this.fileCache.delete(this.cacheKey(fullPath));
      const missing = error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code));
      return this.unavailableReport(relPath, !missing);
    }
  }

  private unavailableReport(filePath: string, unavailable: boolean): FileGroundingReport {
    return { filePath, exists: unavailable, unavailable, lineCount: 0, headroom: 300,
      budgetStatus: 'healthy', skeleton: '', tokenSavingsPercent: 0 };
  }

  private cacheKey(filePath: string): string {
    const key = this.resolvePath(filePath);
    return process.platform === 'win32' ? key.toLowerCase() : key;
  }

  private uniqueFiles(files: string[]): string[] {
    return [...new Map(files.map(file => [this.cacheKey(file), file])).values()];
  }

  private trimSkeleton(skel: string, maxLines = 35, maxChars = 1800): string {
    const full = skel.trim();
    const excerpt = full.split('\n').slice(0, maxLines).join('\n').slice(0, maxChars);
    if (full === excerpt) return full;
    return excerpt + '\n// Excerpt truncated; inspect source before assuming members are absent.';
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
        lines.push(`- **[${item.lens.slice(0, 80).toUpperCase()}]** (${item.severity.slice(0, 40)}): ${item.finding.slice(0, 800)}`);
        if (item.actionableStep) lines.push(`  *Action*: ${item.actionableStep.slice(0, 400)}`);
      }
      return lines.join('\n');
    } catch {
      return '';
    }
  }

  public buildGroundingSection(targetFiles: string[]): string {

    if (!targetFiles || targetFiles.length === 0) return '';
    const unique = this.uniqueFiles(targetFiles);
    const reports = unique.slice(0, 8).map(f => this.inspectFile(f));
    const lines: string[] = ['### 🛡️ Ground-Truth Codebase Reality (Source Snapshot)'];

    for (const r of reports) {
      if (r.unavailable) {
        lines.push(`- \`${r.filePath}\`: Grounding unavailable (not a readable source file or extraction failed). Inspect directly; do not assume it is missing.`);
        continue;
      }
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
    lines.push('AST excerpts are partial observations, not verified complete interfaces. This snapshot may predate upstream edits; reread current target and upstream signatures before editing. Omitted members are not evidence of absence.');
    if (unique.length > reports.length) lines.push(`${unique.length - reports.length} additional file(s) omitted from grounding budget; inspect them directly before edits.`);
    const meshGrounding = this.buildAnalysisMeshGrounding(unique.slice(0, 8));
    if (meshGrounding) lines.push('\n' + meshGrounding);
    return lines.join('\n');
  }

  public buildUpstreamContractsSection(
    upstreamItems: Array<{ subagentName: string; files: string[] }>
  ): string {
    if (!upstreamItems || upstreamItems.length === 0) return '';
    const lines: string[] = ['### 🔗 Upstream Dependency Contracts (Source Snapshots)'];
    let count = 0;
    const seen = new Set<string>();
    let omitted = 0;
    lines.push('Source-derived AST excerpts only; completeness and runtime compatibility are not verified. Recheck current source.');

    for (const item of upstreamItems) {
      for (const f of item.files) {
        const key = this.cacheKey(f);
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > 8) { omitted++; continue; }
        const rep = this.inspectFile(f);
        if (rep.exists && rep.skeleton.trim().length > 0) {
          count++;
          const lang = this.resolveCodeFenceLang(f);
          lines.push(`- Upstream Export from \`${item.subagentName}\` (\`${f}\`):`);
          lines.push(`\`\`\`${lang}\n${rep.skeleton}\n\`\`\``);
        }
      }
    }
    if (omitted) lines.push(`${omitted} additional upstream file(s) omitted from grounding budget; inspect directly before relying on their contracts.`);
    return count > 0 ? lines.join('\n') : '';
  }
}
