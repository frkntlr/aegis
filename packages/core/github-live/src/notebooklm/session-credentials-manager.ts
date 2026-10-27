/**
 * @file session-credentials-manager.ts
 * Session Credentials Manager for Google NotebookLM.
 * Validates, inspects, and safely persists session cookies with token format verification.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

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
    let cleaned = rawInput.trim();
    if (cleaned.toLowerCase().startsWith('cookie:')) {
      cleaned = cleaned.slice(7).trim();
    }
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('\'') && cleaned.endsWith('\''))) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned;
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
        path: '',
        error: `Invalid cookie string. Missing essential tokens: [${val.missingTokens.join(', ')}]`
      };
    }

    const targetPath = customPath || SessionCredentialsManager.resolveDefaultStorePath();
    try {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const payload = {
        cookies: cleaned,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf-8');
      return { success: true, path: targetPath };
    } catch (err: unknown) {
      return {
        success: false,
        path: targetPath,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public static inspectCredentials(customPath?: string): CredentialsInspectResult {
    if (customPath && fs.existsSync(customPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
        const cookies = String(raw.cookies || '');
        const val = SessionCredentialsManager.validateCookieString(cookies);
        return {
          active: val.valid,
          source: 'custom_file',
          hasPsidts: val.hasPsidts,
          hasSid: val.hasSid,
          cookieLength: cookies.length,
          path: customPath
        };
      } catch {
        return { active: false, source: 'invalid_file', hasPsidts: false, hasSid: false, cookieLength: 0 };
      }
    }

    const resolved = MultiRootTokenResolver.resolve();
    return {
      active: resolved.cookies.length > 50 && (resolved.hasSid || resolved.hasPsidts),
      source: resolved.source,
      hasPsidts: resolved.hasPsidts,
      hasSid: resolved.hasSid,
      cookieLength: resolved.cookies.length,
      path: resolved.filePath
    };
  }
}
