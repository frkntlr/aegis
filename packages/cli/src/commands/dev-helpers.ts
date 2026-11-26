import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { IronCageValidator } from '@aegis/iron-cage';
import { runFileMutationTest, type BoundingBox, type MutationGate } from '@aegis/telemetry-tester';
import type { TestFileContent } from '@aegis/trust-verifier';
import { cleanGitEnv, debugLogIgnored, readJsonSafe, resolveSafeRepoRoot, stripBom } from '@aegis/shared';

export interface CageCheckOptions {
  targetDir?: string;
  noCache?: boolean;
  jsonOutput?: boolean;
}

export function parseCageCheckArgs(rawArgs?: string | string[]): CageCheckOptions {
  const args = Array.isArray(rawArgs) ? rawArgs : (rawArgs ? [rawArgs] : []);
  const options: CageCheckOptions = {};
  for (const arg of args) {
    if (arg === '--no-cache' || arg === '--force') {
      options.noCache = true;
    } else if (arg === '--json') {
      options.jsonOutput = true;
    } else if (!arg.startsWith('--') && !options.targetDir) {
      options.targetDir = arg;
    }
  }
  return options;
}

export function verifyFile(file: string, validator: IronCageValidator): boolean {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.error(`❌ File not found: ${full}`);
    return false;
  }
  let content: string;
  try {
    content = fs.readFileSync(full, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to read ${file}: ${msg}`);
    return false;
  }
  const res = validator.validateFileContent(file, content);
  if (res.passed) {
    console.log(`✅ Iron Cage: PASSED for ${file}`);
    return true;
  }
  console.error(`❌ Iron Cage: REJECTED (${res.violations.length} violations) for ${file}`);
  for (const v of res.violations) console.error(` • [${v.rule}] ${v.message}`);
  return false;
}

function runGitFileList(root: string, args: string[]): string[] {
  try {
    const out = execFileSync('git', args, { cwd: root, encoding: 'utf8', env: cleanGitEnv() });
    return out
      .split(/\r?\n/)
      .map(l => l.trim().replace(/\\/g, '/'))
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts') && fs.existsSync(path.resolve(root, f)));
  } catch (err: unknown) {
    debugLogIgnored('dev-helpers:getChangedSourceFiles', err);
    return [];
  }
}

export function getChangedSourceFiles(): string[] {
  const root = resolveSafeRepoRoot();
  if (!fs.existsSync(path.join(root, '.git'))) return [];
  const workingTreeDiffs = [
    ['diff', '--name-only', '--diff-filter=ACM'],
    ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
    ['ls-files', '--others', '--exclude-standard']
  ];
  const combined = new Set<string>();
  for (const args of workingTreeDiffs) {
    for (const file of runGitFileList(root, args)) combined.add(file);
  }
  if (combined.size > 0) return [...combined];
  for (const args of [
    ['diff', '--name-only', 'origin/master...HEAD', '--diff-filter=ACM'],
    ['diff', '--name-only', 'HEAD~1...HEAD', '--diff-filter=ACM']
  ]) {
    const files = runGitFileList(root, args);
    if (files.length > 0) return files;
  }
  return [];
}

export function getChangedLinesForFile(file: string, root = resolveSafeRepoRoot()): Set<number> | undefined {
  if (!fs.existsSync(path.join(root, '.git'))) return undefined;
  try {
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', file], { cwd: root, stdio: 'pipe', env: cleanGitEnv() });
    } catch { return undefined; }
    let diff = '';
    for (const ref of ['HEAD', 'origin/master...HEAD', 'HEAD~1...HEAD']) {
      diff = execFileSync('git', ['diff', '--ignore-cr-at-eol', ref, '-U0', '--', file], { cwd: root, encoding: 'utf8', env: cleanGitEnv() });
      if (diff.trim().length > 0) break;
    }
    const lines = new Set<number>();
    for (const l of diff.split(/\r?\n/)) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l);
      if (!m) continue;
      const start = Number(m[1]), count = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = 0; i < count; i++) lines.add(start + i);
    }
    return lines;
  } catch (err: unknown) {
    debugLogIgnored('dev-helpers:getChangedLines', err);
    return undefined;
  }
}

export function runMutationGateOnFile(file: string, _gate?: MutationGate, changedLines?: ReadonlySet<number>): boolean {
  const repoRoot = resolveSafeRepoRoot();
  const fullPath = [path.resolve(process.cwd(), file), path.resolve(repoRoot, file)].find(p => fs.existsSync(p));
  if (!fullPath) {
    console.error(`❌ File not found: ${path.resolve(process.cwd(), file)}`);
    return false;
  }
  const report = runFileMutationTest({ filePath: fullPath, repoRoot, thresholdPercent: 70, changedLines });
  console.log(`🧪 Mutation Testing Gate for: ${file}`);
  console.log(` • Baseline Tests:          ${report.baselinePassed ? 'PASSED' : 'FAILED'}`);
  console.log(` • Total Mutants Generated: ${report.totalMutants}`);
  console.log(` • Sampled / Skipped:       ${report.sampledMutants} / ${report.skippedCompileErrors} compile-skipped`);
  console.log(` • Mutants Killed / Surv.:  ${report.killedMutants} / ${report.survivedMutants}`);
  console.log(` • Mutation Score:          ${report.scorePercent}% (Min: 70%)`);
  if (report.reason) console.log(` • Reason:                  ${report.reason}`);
  for (const s of report.survivors.slice(0, 5)) console.log(`   - [Line ${s.line}] ${s.desc}`);
  console.log(` • Verdict:                 ${report.passedThreshold ? 'PASSED ✅' : 'REJECTED ❌'}`);
  return report.passedThreshold;
}

export function collectSourceFiles(dir: string, includeScenes = false): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  try {
    if (fs.statSync(dir).isFile()) return [dir];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const regex = includeScenes
      ? /\.(ts|tsx|py|gd|tscn|tres|cs|rs|go|cpp|c|h|hpp|sh|bash|xaml)$/
      : /\.(ts|tsx|py|gd|cs|rs|go|cpp|c|h|hpp|sh|bash)$/;

    for (const entry of entries) {
      if (['node_modules', 'dist', '.git', 'experimental', '.mcp', '.aegis', '.godot'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectSourceFiles(full, includeScenes));
      } else if (regex.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        results.push(full);
      }
    }
  } catch (err: unknown) {
    debugLogIgnored('dev-helpers:collectSourceFiles', err);
  }
  return results;
}

export function printRadarAlerts(alerts: Array<{ file: string; lines: number; msg: string }>): void {
  if (alerts.length === 0) return;
  console.log(` ⚠️  Proaktif Kota Radarı (${alerts.length} dosya sınıra yaklaştı):`);
  for (const a of alerts) console.log(`   - ${a.file} (${a.lines}/300 satır) -> Öneri: ${a.msg}`);
}

function resolveTelemetryJsonPath(targetArg?: string): { jsonPath?: string; error?: string } {
  const candidates = targetArg
    ? [path.resolve(process.cwd(), targetArg), path.resolve(resolveSafeRepoRoot(), targetArg)]
    : [path.join(process.cwd(), '.aegis', 'ui_telemetry.json'), path.join(process.cwd(), '.aegis', 'telemetry.json')];
  const existing = candidates.find(p => fs.existsSync(p));
  if (!existing) {
    return { error: targetArg ? `Telemetry target not found: ${targetArg}` : 'No .aegis/ui_telemetry.json found in working directory.' };
  }
  if (fs.statSync(existing).isDirectory()) {
    const dirFile = [path.join(existing, '.aegis', 'ui_telemetry.json'), path.join(existing, '.aegis', 'telemetry.json')].find(p => fs.existsSync(p));
    return dirFile ? { jsonPath: dirFile } : { error: `No .aegis/ui_telemetry.json found in directory: ${targetArg}` };
  }
  return existing.endsWith('.json') ? { jsonPath: existing } : { error: `Unsupported telemetry format (expected .json): ${targetArg}` };
}

function toBoundingBox(item: unknown): BoundingBox | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const rect = (obj.rect && typeof obj.rect === 'object' ? obj.rect : obj) as Record<string, unknown>;
  if (typeof obj.id !== 'string') return null;
  const nums = [rect.x, rect.y, rect.width, rect.height];
  if (!nums.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const box: BoundingBox = { id: obj.id, x: rect.x as number, y: rect.y as number, width: rect.width as number, height: rect.height as number };
  if (typeof obj.zIndex === 'number' && Number.isFinite(obj.zIndex)) box.zIndex = obj.zIndex;
  if (typeof obj.parentId === 'string') box.parentId = obj.parentId;
  return box;
}

export function loadInspectBoxes(targetArg?: string): { boxes: BoundingBox[]; error?: string } {
  const { jsonPath, error } = resolveTelemetryJsonPath(targetArg);
  if (!jsonPath) return { boxes: [], error };
  try {
    const parsed = readJsonSafe<unknown>(jsonPath);
    const rawList = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { nodes?: unknown[] }).nodes) ? (parsed as { nodes: unknown[] }).nodes : null);
    if (!rawList) return { boxes: [], error: `Invalid telemetry JSON schema in ${jsonPath}` };
    const boxes = rawList.map(toBoundingBox).filter((b): b is BoundingBox => b !== null);
    return boxes.length > 0 ? { boxes } : { boxes: [], error: `Telemetry contains zero valid elements: ${jsonPath}` };
  } catch (err: unknown) {
    return { boxes: [], error: `Failed to parse telemetry JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function getGitModifiedFiles(root: string): string[] {
  if (!fs.existsSync(path.join(root, '.git'))) return [];
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', env: cleanGitEnv() });
    return out.split(/\r?\n/).filter(l => l.length >= 4).map(l => {
      const raw = l.slice(3).trim();
      const target = raw.includes(' -> ') ? raw.split(' -> ').pop()!.trim() : raw;
      return target.replace(/^"(.*)"$/, '$1');
    }).filter(Boolean);
  } catch (err: unknown) {
    debugLogIgnored('dev-helpers:gitStatus', err);
    return [];
  }
}

export function loadAuditTestReport(root: string): { found: boolean; passedCount: number; failedCount: number } {
  const candidates = [
    path.join(process.cwd(), '.aegis', 'cache', 'last-test-run.json'),
    path.join(process.cwd(), '.aegis', 'last-test-run.json'),
    path.join(process.cwd(), 'last-test-run.json'),
    path.join(process.cwd(), 'test-results.json'),
    path.join(root, '.aegis', 'cache', 'last-test-run.json'),
    path.join(root, 'last-test-run.json')
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const d = readJsonSafe<Record<string, unknown>>(file);
      const passed = Number(d.numPassedTests ?? d.passedCount ?? d.passed ?? 0);
      let failed = Number(d.numFailedTests ?? d.failedCount ?? d.failed ?? 0);
      if ((!Number.isFinite(failed) || failed === 0) && Array.isArray(d.failures)) failed = d.failures.length;
      return { found: true, passedCount: Number.isFinite(passed) ? passed : 0, failedCount: Number.isFinite(failed) ? failed : 0 };
    } catch (err: unknown) {
      debugLogIgnored('dev-helpers:loadAuditTestReport', err);
    }
  }
  return { found: false, passedCount: 0, failedCount: 0 };
}

export function collectAuditTestContents(files: string[], root: string): TestFileContent[] {
  const results: TestFileContent[] = [];
  const seen = new Set<string>();
  const addFile = (relOrAbs: string) => {
    const abs = [path.resolve(process.cwd(), relOrAbs), path.resolve(root, relOrAbs)].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    try {
      results.push({ filePath: relOrAbs, content: stripBom(fs.readFileSync(abs, 'utf8')), isNew: false });
    } catch (err: unknown) {
      debugLogIgnored('dev-helpers:collectAuditTestContents', err);
    }
  };
  for (const f of files) {
    if (/\.(test|spec)\.(ts|js|tsx|jsx|py|gd)$/i.test(f)) addFile(f);
    else if (/\.(ts|js)$/i.test(f)) {
      const stem = f.replace(/\.(ts|js)$/i, '');
      addFile(`${stem}.test.ts`);
      addFile(`${stem}.test.js`);
      addFile(`${stem}.spec.ts`);
    }
  }
  return results;
}
