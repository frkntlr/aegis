/**
 * @file multi-root-token-resolver.ts
 * Multi-Root Token Resolver with Worktree-Aware Directory Traversal.
 * Discovers Google NotebookLM session cookies across environment, project, and user home.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TokenResolveResult } from './types.js';

export interface TokenResolverOptions {
  customCwd?: string;
  customHome?: string;
  env?: Record<string, string | undefined>;
}

export class MultiRootTokenResolver {
  public static resolve(options: TokenResolverOptions = {}): TokenResolveResult {
    const env = options.env || process.env;
    const envCookies = env.NOTEBOOKLM_SESSION || env.GOOGLE_SESSION_TOKEN || env.NOTEBOOKLM_COOKIES;
    if (envCookies && envCookies.trim()) {
      return MultiRootTokenResolver.buildResult(envCookies.trim(), 'env');
    }

    const cwd = options.customCwd || process.cwd();
    const projectPath = MultiRootTokenResolver.findProjectAuth(cwd);
    if (projectPath && fs.existsSync(projectPath)) {
      const parsed = MultiRootTokenResolver.readAuthFile(projectPath);
      if (parsed) return MultiRootTokenResolver.buildResult(parsed, 'project', projectPath);
    }

    const home = options.customHome || os.homedir();
    const globalPaths = [
      path.join(home, '.aegis', 'auth', 'notebooklm.json'),
      path.join(home, '.notebooklm-mcp', 'auth.json')
    ];
    for (const gp of globalPaths) {
      if (fs.existsSync(gp)) {
        const parsed = MultiRootTokenResolver.readAuthFile(gp);
        if (parsed) return MultiRootTokenResolver.buildResult(parsed, 'global', gp);
      }
    }

    return { cookies: '', source: 'none', hasPsidts: false, hasSid: false };
  }

  public static findProjectAuth(startDir: string): string | null {
    let cur = path.resolve(startDir);
    for (let i = 0; i < 5; i++) {
      const direct = path.join(cur, '.aegis', 'auth', 'notebooklm.json');
      if (fs.existsSync(direct)) return direct;

      const dotAegis = path.join(cur, '.aegis');
      if (fs.existsSync(dotAegis)) return direct;

      const gitMarker = path.join(cur, '.git');
      if (fs.existsSync(gitMarker)) {
        const candidate = path.join(cur, '.aegis', 'auth', 'notebooklm.json');
        return candidate;
      }

      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return null;
  }

  public static saveCookies(cookies: string, targetPath?: string, customCwd?: string): boolean {
    const p = targetPath || MultiRootTokenResolver.resolveDefaultSavePath(customCwd);
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const payload = {
        cookies,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  public static resolveDefaultSavePath(customCwd?: string): string {
    const cwd = customCwd || process.cwd();
    const projectAuth = MultiRootTokenResolver.findProjectAuth(cwd);
    if (projectAuth) return projectAuth;
    return path.join(os.homedir(), '.aegis', 'auth', 'notebooklm.json');
  }

  private static readAuthFile(filePath: string): string | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(raw);
      if (typeof json === 'object' && json && typeof json.cookies === 'string') {
        return json.cookies;
      }
      return null;
    } catch {
      return null;
    }
  }

  private static buildResult(
    cookies: string,
    source: 'env' | 'project' | 'global',
    filePath?: string
  ): TokenResolveResult {
    const hasSid = cookies.includes('SID=');
    const hasPsidts = cookies.includes('__Secure-1PSIDTS=');
    return {
      cookies,
      source,
      filePath,
      hasSid,
      hasPsidts
    };
  }
}
