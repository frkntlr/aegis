import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SemanticFileManifest { files: string[]; timestamp: number }

const manifestPath = (root: string): string => path.join(root, '.aegis/cache/fast-semantic-manifest.json');

/** Git index changes omit untracked edits, so disk reuse also has a bounded age. */
export function readSemanticManifest(root: string, index: string | null, ttl: number, now: number): SemanticFileManifest | null {
  if (!index) return null;
  try {
    const data: unknown = JSON.parse(fs.readFileSync(manifestPath(root), 'utf8'));
    if (!data || typeof data !== 'object') return null;
    const item = data as { gitIndexMtime?: unknown; files?: unknown; timestamp?: unknown };
    if (typeof item.timestamp !== 'number' || !Number.isFinite(item.timestamp) ||
        now < item.timestamp || now - item.timestamp >= ttl ||
        item.gitIndexMtime !== fs.statSync(index).mtimeMs || !Array.isArray(item.files) ||
        item.files.some(file => typeof file !== 'string')) return null;
    return { files: item.files as string[], timestamp: item.timestamp };
  } catch { return null; }
}

export function saveSemanticManifest(root: string, index: string | null, snapshot: SemanticFileManifest): void {
  if (!index) return;
  try {
    const file = manifestPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ gitIndexMtime: fs.statSync(index).mtimeMs, ...snapshot }), 'utf8');
  } catch { /* Discovery remains available when disk caching is unavailable. */ }
}
