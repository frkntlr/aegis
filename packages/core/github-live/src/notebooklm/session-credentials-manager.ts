/**
 * @file session-credentials-manager.ts
 * Session Credentials Manager for Google NotebookLM.
 * Validates, inspects, and safely persists session cookies with token format verification.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MultiRootTokenResolver } from './multi-root-token-resolver.js';

export interface CookieValidationResult {
  valid: boolean;
  missingTokens: string[];
  hasPsidts: boolean;
  hasSid: boolean;
  hasHsid: boolean;
}

export interface CredentialsInspectResult {
  active: boolean;
  source: string;
  hasPsidts: boolean;
  hasSid: boolean;
  cookieLength: number;
  path?: string;
}

export class SessionCredentialsManager {
  public static sanitizeCookieInput(rawInput: string): string {
    if (!rawInput) return '';
    const trimmed = rawInput.trim();

    const fromJson = SessionCredentialsManager.extractFromJson(trimmed);
    if (fromJson) return fromJson;

    const fromCurl = SessionCredentialsManager.extractFromCurl(trimmed);
    if (fromCurl) return fromCurl;

    let cleaned = trimmed;
    if (cleaned.toLowerCase().startsWith('cookie:')) {
      cleaned = cleaned.slice(7).trim();
    }
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('\'') && cleaned.endsWith('\''))) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned;
  }

  private static extractFromCurl(input: string): string | null {
    const curlHeader = input.match(/(?:-H|--header)\s+['"][Cc]ookie:\s*([^'"]+)['"]/i);
    if (curlHeader && curlHeader[1]) return curlHeader[1].trim();

    const curlCookie = input.match(/(?:-b|--cookie)\s+['"]([^'"]+)['"]/i);
    if (curlCookie && curlCookie[1]) return curlCookie[1].trim();

    return null;
  }

  private static extractFromJson(input: string): string | null {
    if (!input.startsWith('{') || !input.endsWith('}')) return null;
    try {
      const parsed = JSON.parse(input) as Record<string, unknown>;
      if (typeof parsed.cookies === 'string') return parsed.cookies.trim();
      if (typeof parsed.cookie === 'string') return parsed.cookie.trim();
      const entries = Object.entries(parsed).filter(([_, v]) => typeof v === 'string');
      if (entries.length > 0) return entries.map(([k, v]) => `${k}=${v}`).join('; ');
    } catch {
      // Non-JSON string
    }
    return null;
  }

  public static readSystemClipboard(runner?: (cmd: string, args: string[]) => string): string | null {
    try {
      if (runner) return runner('', []);
      if (process.platform === 'win32') {
        const out = child_process.spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], {
          encoding: 'utf-8',
          timeout: 3000
        });
        return out.stdout ? out.stdout.trim() : null;
      }
      if (process.platform === 'darwin') {
        const out = child_process.spawnSync('pbpaste', [], { encoding: 'utf-8', timeout: 3000 });
        return out.stdout ? out.stdout.trim() : null;
      }
      const out = child_process.spawnSync('xclip', ['-selection', 'clipboard', '-o'], {
        encoding: 'utf-8',
        timeout: 3000
      });
      return out.stdout ? out.stdout.trim() : null;
    } catch {
      return null;
    }
  }

  public static validateCookieString(cookieString: string): CookieValidationResult {
    const cleaned = SessionCredentialsManager.sanitizeCookieInput(cookieString);
    const hasSid = /(?:^|;\s*)SID=/.test(cleaned);
    const hasHsid = /(?:^|;\s*)HSID=/.test(cleaned);
    const hasPsidts = /(?:^|;\s*)__Secure-1PSIDTS=/.test(cleaned);

    const missing: string[] = [];
    if (!hasSid) missing.push('SID');
    if (!hasHsid) missing.push('HSID');
    if (!hasPsidts) missing.push('__Secure-1PSIDTS');

    const valid = cleaned.length > 50 && (hasSid || hasPsidts);
    return { valid, missingTokens: missing, hasPsidts, hasSid, hasHsid };
  }

  public static resolveDefaultStorePath(): string {
    const home = os.homedir();
    return path.join(home, '.notebooklm-mcp', 'auth.json');
  }

  public static saveCredentials(
    rawCookie: string,
    customPath?: string
  ): { success: boolean; path: string; error?: string } {
    const cleaned = SessionCredentialsManager.sanitizeCookieInput(rawCookie);
    const val = SessionCredentialsManager.validateCookieString(cleaned);
    if (!val.valid) {
      return {
        success: false,
        path: customPath || SessionCredentialsManager.resolveDefaultStorePath(),
        error: `Invalid cookie string. Missing critical tokens: ${val.missingTokens.join(', ')}`
      };
    }

    const targetPath = customPath || SessionCredentialsManager.resolveDefaultStorePath();
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const payload = JSON.stringify({ cookies: cleaned }, null, 2);
    fs.writeFileSync(targetPath, payload, { encoding: 'utf-8' });

    return { success: true, path: targetPath };
  }

  public static tryExtractFromClipboard(runner?: (cmd: string, args: string[]) => string): { found: boolean; cookies?: string } {
    const raw = SessionCredentialsManager.readSystemClipboard(runner);
    if (!raw) return { found: false };
    const sanitized = SessionCredentialsManager.sanitizeCookieInput(raw);
    const val = SessionCredentialsManager.validateCookieString(sanitized);
    if (val.valid) {
      return { found: true, cookies: sanitized };
    }
    return { found: false };
  }

  public static inspectCredentials(customCwdOrFile?: string): CredentialsInspectResult {
    if (customCwdOrFile && fs.existsSync(customCwdOrFile) && fs.statSync(customCwdOrFile).isFile()) {
      return SessionCredentialsManager.inspectCustomFile(customCwdOrFile);
    }

    const resolved = MultiRootTokenResolver.resolve({ customCwd: customCwdOrFile });
    if (!resolved.cookies) {
      return {
        active: false,
        source: 'none',
        hasPsidts: false,
        hasSid: false,
        cookieLength: 0,
        path: resolved.filePath
      };
    }

    return {
      active: resolved.hasPsidts || resolved.hasSid,
      source: resolved.source,
      hasPsidts: resolved.hasPsidts,
      hasSid: resolved.hasSid,
      cookieLength: resolved.cookies.length,
      path: resolved.filePath
    };
  }

  private static inspectCustomFile(filePath: string): CredentialsInspectResult {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const cookies = typeof parsed?.cookies === 'string' ? parsed.cookies : '';
      const hasPsidts = /(?:^|;\s*)__Secure-1PSIDTS=/.test(cookies);
      const hasSid = /(?:^|;\s*)SID=/.test(cookies);
      return {
        active: hasPsidts || hasSid,
        source: 'custom_file',
        hasPsidts,
        hasSid,
        cookieLength: cookies.length,
        path: filePath
      };
    } catch {
      return { active: false, source: 'none', hasPsidts: false, hasSid: false, cookieLength: 0, path: filePath };
    }
  }
}
