import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, resolveSafeRepoRoot } from '@aegis/shared';

export type RepoRootResult = { ok: true; root: string } | { ok: false; reason: string };
export type ContainedPathResult =
  | { ok: true; resolved: string; realPath: string }
  | { ok: false; reason: string };

export function hasUnsafePathSyntax(input: string): boolean {
  if (!input || !input.trim() || input.includes('\0')) return true;
  const norm = input.replace(/\\/g, '/');
  return /^\/\/[?.](\/|$)/.test(norm) || /^[A-Za-z]:(?![/])/.test(norm);
}

export function isPathWithinBase(baseDir: string, targetPath: string): boolean {
  const caseInsensitive = process.platform === 'win32';
  const cmpBase = caseInsensitive ? baseDir.toLowerCase() : baseDir;
  const cmpTarget = caseInsensitive ? targetPath.toLowerCase() : targetPath;
  const rel = path.relative(cmpBase, cmpTarget);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function tryReadDanglingLink(cur: string): string | null {
  try {
    const st = fs.lstatSync(cur);
    if (!st.isSymbolicLink()) return null;
    const target = fs.readlinkSync(cur);
    return path.isAbsolute(target) ? target : path.resolve(path.dirname(cur), target);
  } catch (err: unknown) {
    debugLogIgnored('path-containment:tryReadDanglingLink', err);
    return null;
  }
}

export function resolveNearestRealpath(targetPath: string): string | null {
  let cur = targetPath;
  const tail: string[] = [];
  let hops = 0;
  while (true) {
    if (fs.existsSync(cur)) {
      try {
        const real = fs.realpathSync(cur);
        return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
      } catch (err: unknown) {
        debugLogIgnored('path-containment:resolveNearestRealpath', err);
        return null;
      }
    }
    const linkTarget = tryReadDanglingLink(cur);
    if (linkTarget) {
      hops++;
      if (hops > 32) return null;
      cur = linkTarget;
      continue;
    }
    const parent = path.dirname(cur);
    if (parent === cur) return hops > 0 ? null : targetPath;
    tail.push(path.basename(cur));
    cur = parent;
  }
}

export function requireExistingRepoRoot(repoRoot?: string): RepoRootResult {
  if (repoRoot !== undefined && hasUnsafePathSyntax(repoRoot)) {
    return { ok: false, reason: 'Invalid repository root path.' };
  }
  const candidate = repoRoot === undefined ? resolveSafeRepoRoot(undefined) : repoRoot;
  const resolved = path.resolve(candidate);
  try {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return { ok: false, reason: `Repository root does not exist: ${resolved}` };
    }
    return { ok: true, root: fs.realpathSync(resolved) };
  } catch (err: unknown) {
    debugLogIgnored('path-containment:requireExistingRepoRoot', err);
    return { ok: false, reason: `Repository root is inaccessible: ${resolved}` };
  }
}

export function resolveContainedPath(
  repoRoot: string,
  inputPath: string,
  opts?: { allowNonExistent?: boolean }
): ContainedPathResult {
  if (hasUnsafePathSyntax(inputPath)) {
    return { ok: false, reason: 'Invalid or unsafe path syntax.' };
  }
  const baseResolved = path.resolve(repoRoot);
  const targetResolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(baseResolved, inputPath);
  if (!isPathWithinBase(baseResolved, targetResolved)) {
    return { ok: false, reason: 'Path escapes repository root.' };
  }
  const realBase = resolveNearestRealpath(baseResolved);
  const realTarget = resolveNearestRealpath(targetResolved);
  if (!realBase || !realTarget || !isPathWithinBase(realBase, realTarget)) {
    return { ok: false, reason: 'Resolved realpath escapes repository root.' };
  }
  if (!opts?.allowNonExistent && !fs.existsSync(realTarget)) {
    return { ok: false, reason: `Target path does not exist: ${inputPath}` };
  }
  return { ok: true, resolved: targetResolved, realPath: realTarget };
}

export function isSafeIdentifier(val: string): boolean {
  return (
    typeof val === 'string' &&
    val.length > 0 &&
    val !== '.' &&
    !val.includes('..') &&
    /^[A-Za-z0-9._@-]+$/.test(val)
  );
}

export function isSafePackageName(val: string): boolean {
  return (
    typeof val === 'string' &&
    val.length > 0 &&
    val.length <= 214 &&
    !val.includes('..') &&
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(val)
  );
}

export function isSafeTopicName(val: string): boolean {
  return (
    typeof val === 'string' &&
    val.length > 0 &&
    val.length <= 128 &&
    !val.includes('..') &&
    /^[A-Za-z0-9._:/-]+$/.test(val)
  );
}
