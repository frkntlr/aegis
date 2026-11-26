import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  cleanGitEnv,
  debugLogIgnored,
  formatErrorMessage,
  readJsonSafe,
  stripBom
} from '@aegis/shared';
import type { BoundingBox } from '@aegis/telemetry-tester';
import type { TestFileContent } from '@aegis/trust-verifier';
import { requireExistingRepoRoot, resolveContainedPath } from './path-containment.js';

const execFileAsync = promisify(execFile);

export interface LoadedLayout {
  elements: BoundingBox[];
  viewport?: { width: number; height: number; name?: string };
}

export interface AuditTestReport {
  found: boolean;
  passedCount: number;
  failedCount: number;
}

function toBoundingBox(item: unknown): BoundingBox | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const rect = (obj.rect && typeof obj.rect === 'object' ? obj.rect : obj) as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id ? obj.id : (typeof obj.name === 'string' && obj.name ? obj.name : null);
  if (!id) return null;
  const nums = [rect.x, rect.y, rect.width, rect.height];
  if (!nums.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const box: BoundingBox = {
    id,
    x: rect.x as number,
    y: rect.y as number,
    width: rect.width as number,
    height: rect.height as number
  };
  if (typeof obj.zIndex === 'number' && Number.isFinite(obj.zIndex)) box.zIndex = obj.zIndex;
  if (typeof obj.parentId === 'string') box.parentId = obj.parentId;
  return box;
}

function filterContainedJsonCandidates(root: string, candidates: string[]): string[] {
  const out: string[] = [];
  for (const candidate of candidates) {
    const res = resolveContainedPath(root, candidate, { allowNonExistent: false });
    if (res.ok && res.realPath.endsWith('.json')) out.push(res.realPath);
  }
  return out;
}

function resolveTelemetryCandidates(layoutPath?: string, repoRoot?: string): string[] {
  const rootRes = requireExistingRepoRoot(repoRoot);
  if (!rootRes.ok) return [];
  const root = rootRes.root;
  if (!layoutPath) {
    return filterContainedJsonCandidates(root, ['.aegis/ui_telemetry.json', '.aegis/telemetry.json']);
  }
  const res = resolveContainedPath(root, layoutPath, { allowNonExistent: false });
  if (!res.ok) return [];
  if (fs.statSync(res.realPath).isDirectory()) {
    return filterContainedJsonCandidates(root, [
      path.join(res.realPath, '.aegis', 'ui_telemetry.json'),
      path.join(res.realPath, '.aegis', 'telemetry.json')
    ]);
  }
  return res.realPath.endsWith('.json') ? [res.realPath] : [];
}

function parseTelemetryPayload(parsed: unknown): LoadedLayout | null {
  if (Array.isArray(parsed)) {
    const elements = parsed.map(toBoundingBox).filter((b): b is BoundingBox => b !== null);
    return elements.length > 0 ? { elements } : null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as {
    nodes?: unknown[];
    viewport?: { width?: unknown; height?: unknown; aspectRatio?: unknown; name?: unknown };
  };
  if (!Array.isArray(obj.nodes)) return null;
  const elements = obj.nodes.map(toBoundingBox).filter((b): b is BoundingBox => b !== null);
  if (elements.length === 0) return null;
  const vp = obj.viewport;
  const hasVp = vp && typeof vp.width === 'number' && Number.isFinite(vp.width) && typeof vp.height === 'number' && Number.isFinite(vp.height);
  const vpName = vp && (typeof vp.name === 'string' ? vp.name : typeof vp.aspectRatio === 'string' ? vp.aspectRatio : undefined);
  return { elements, viewport: hasVp ? { width: vp.width as number, height: vp.height as number, name: vpName } : undefined };
}

export function loadTelemetryLayout(layoutPath?: string, repoRoot?: string): LoadedLayout {
  for (const candidate of resolveTelemetryCandidates(layoutPath, repoRoot)) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = readJsonSafe<unknown>(candidate);
      const layout = parseTelemetryPayload(parsed);
      if (layout) return layout;
    } catch (err: unknown) {
      debugLogIgnored('engine-service:loadElements', err);
    }
  }
  return { elements: [] };
}

export async function readGitDiffHead(repoRoot?: string): Promise<{ diff: string; error?: string }> {
  const rootRes = requireExistingRepoRoot(repoRoot);
  if (!rootRes.ok) return { diff: '', error: rootRes.reason };
  const root = rootRes.root;
  if (!fs.existsSync(path.join(root, '.git'))) {
    return { diff: '', error: 'Not a git repository.' };
  }
  try {
    const { stdout } = await execFileAsync('git', ['diff', '-U3', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      env: cleanGitEnv()
    });
    return { diff: stdout };
  } catch (err: unknown) {
    debugLogIgnored('engine-service:runDiffValidator', err);
    return { diff: '', error: formatErrorMessage(err) };
  }
}

export async function getGitModifiedFiles(repoRoot: string): Promise<string[]> {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) return [];
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: cleanGitEnv()
    });
    return stdout
      .split(/\r?\n/)
      .filter(l => l.length >= 4)
      .map(l => {
        const raw = l.slice(3).trim();
        const target = raw.includes(' -> ') ? (raw.split(' -> ').pop()?.trim() ?? raw) : raw;
        return target.replace(/^"(.*)"$/, '$1');
      })
      .filter(Boolean);
  } catch (err: unknown) {
    debugLogIgnored('engine-service:runOracleAudit', err);
    return [];
  }
}

export function loadAuditTestReport(repoRoot: string): AuditTestReport {
  const candidates = [
    path.join(repoRoot, '.aegis', 'cache', 'last-test-run.json'),
    path.join(repoRoot, '.aegis', 'last-test-run.json'),
    path.join(repoRoot, 'last-test-run.json'),
    path.join(repoRoot, 'test-results.json')
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const d = readJsonSafe<Record<string, unknown>>(file);
      const passed = Number(d.numPassedTests ?? d.passedCount ?? d.passed ?? 0);
      let failed = Number(d.numFailedTests ?? d.failedCount ?? d.failed ?? 0);
      if ((!Number.isFinite(failed) || failed === 0) && Array.isArray(d.failures)) {
        failed = d.failures.length;
      }
      return {
        found: true,
        passedCount: Number.isFinite(passed) ? passed : 0,
        failedCount: Number.isFinite(failed) ? failed : 0
      };
    } catch (err: unknown) {
      debugLogIgnored('engine-service:loadAuditTestReport', err);
    }
  }
  return { found: false, passedCount: 0, failedCount: 0 };
}

export function findUncontainedAuditPath(files: string[], repoRoot: string): string | null {
  for (const f of files) {
    const check = resolveContainedPath(repoRoot, f, { allowNonExistent: true });
    if (!check.ok) return `${f} (${check.reason})`;
  }
  return null;
}

export function collectAuditTestContents(files: string[], repoRoot: string): TestFileContent[] {
  const results: TestFileContent[] = [];
  const seen = new Set<string>();
  const addFile = (relOrAbs: string) => {
    const check = resolveContainedPath(repoRoot, relOrAbs, { allowNonExistent: false });
    if (!check.ok) return;
    const abs = check.realPath;
    if (seen.has(abs) || !fs.statSync(abs).isFile()) return;
    seen.add(abs);
    try {
      results.push({ filePath: relOrAbs, content: stripBom(fs.readFileSync(abs, 'utf8')), isNew: false });
    } catch (err: unknown) {
      debugLogIgnored('engine-service:collectAuditTestContents', err);
    }
  };
  for (const f of files) {
    if (/\.(test|spec)\.(ts|js|tsx|jsx|py|gd)$/i.test(f)) {
      addFile(f);
    } else if (/\.(ts|js)$/i.test(f)) {
      const stem = f.replace(/\.(ts|js)$/i, '');
      addFile(`${stem}.test.ts`);
      addFile(`${stem}.test.js`);
      addFile(`${stem}.spec.ts`);
    }
  }
  return results;
}
