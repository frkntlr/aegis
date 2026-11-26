import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { BoundingBox } from '@aegis/telemetry-tester';
import type { TestFileContent } from '@aegis/trust-verifier';
import { cleanGitEnv, debugLogIgnored, readJsonSafe, resolveSafeRepoRoot, stripBom } from '@aegis/shared';

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
      const target = raw.includes(' -> ') ? raw.split(' -> ').pop()?.trim() ?? raw : raw;
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
