/**
 * @file http-rotate-engine.ts
 * Zero-Chromium Headless Session Rotation Engine for Google NotebookLM.
 * Refreshes __Secure-1PSIDTS session tokens via pure HTTP POST to accounts.google.com/RotateCookies.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { MultiRootTokenResolver } from './multi-root-token-resolver.js';
import type { HttpPostFunction, HttpResponse } from './types.js';

export interface RotateResult {
  success: boolean;
  refreshedCookies?: string;
  newPsidts?: string;
  error?: string;
}

export interface RotateOptions {
  httpPost?: HttpPostFunction;
  saveOnSuccess?: boolean;
  customSavePath?: string;
  customCwd?: string;
  timeoutMs?: number;
}

const ROTATE_ENDPOINT = 'https://accounts.google.com/RotateCookies';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class HttpRotateEngine {
  public static parseCookies(cookieString: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const part of cookieString.split(';')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) map.set(name, value);
    }
    return map;
  }

  public static serializeCookies(cookieMap: Map<string, string>): string {
    return Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  public static canRotate(cookieMap: Map<string, string>): boolean {
    const hasSid = cookieMap.has('SID');
    const hasBinding = cookieMap.has('OSID') || (cookieMap.has('APISID') && cookieMap.has('SAPISID'));
    return hasSid && hasBinding;
  }

  public static buildAccountsCookieHeader(cookieMap: Map<string, string>): string {
    const accountsJar = new Map(cookieMap);
    accountsJar.delete('OSID');
    accountsJar.delete('__Secure-OSID');
    return HttpRotateEngine.serializeCookies(accountsJar);
  }

  public static extractSetCookies(headers: Record<string, string | string[]>): Map<string, string> {
    const extracted = new Map<string, string>();
    const raw = headers['set-cookie'];
    if (!raw) return extracted;

    const list = Array.isArray(raw) ? raw : [raw];
    for (const h of list) {
      const pair = h.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      if (name && val && val !== '""') {
        extracted.set(name, val);
      }
    }
    return extracted;
  }

  public static async rotate(cookies: string, options: RotateOptions = {}): Promise<RotateResult> {
    const jar = HttpRotateEngine.parseCookies(cookies);
    if (!HttpRotateEngine.canRotate(jar)) {
      return { success: false, error: 'Cannot rotate cookies: Missing SID or secondary binding tokens (OSID / SAPISID).' };
    }

    const postFn = options.httpPost || HttpRotateEngine.defaultFetchPost;
    const accountsCookieHeader = HttpRotateEngine.buildAccountsCookieHeader(jar);
    const body = '[0,"-0000000000000000000"]';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Origin': 'https://accounts.google.com',
      'Cookie': accountsCookieHeader,
      'User-Agent': USER_AGENT
    };

    try {
      const res = await postFn(ROTATE_ENDPOINT, body, { headers, timeoutMs: options.timeoutMs ?? 15000 });
      return HttpRotateEngine.handleRotateResponse(res, jar, options);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `HTTP RotateCookies network failure: ${msg}` };
    }
  }

  private static handleRotateResponse(res: HttpResponse, jar: Map<string, string>, options: RotateOptions): RotateResult {
    if (res.status === 401 || res.status === 403) {
      return { success: false, error: `RotateCookies rejected by Google (HTTP ${res.status}). Full re-authentication required.` };
    }
    if (res.status !== 200) {
      return { success: false, error: `RotateCookies failed with unexpected status (HTTP ${res.status}).` };
    }

    const newCookies = HttpRotateEngine.extractSetCookies(res.headers);
    let updated = false;
    let newPsidts: string | undefined;

    for (const [k, v] of newCookies.entries()) {
      jar.set(k, v);
      updated = true;
      if (k === '__Secure-1PSIDTS') newPsidts = v;
    }

    if (!updated) {
      return { success: false, error: 'RotateCookies succeeded (200) but returned no Set-Cookie headers.' };
    }

    const refreshedCookies = HttpRotateEngine.serializeCookies(jar);
    if (options.saveOnSuccess !== false) {
      MultiRootTokenResolver.saveCookies(refreshedCookies, options.customSavePath, options.customCwd);
    }

    return { success: true, refreshedCookies, newPsidts };
  }

  private static async defaultFetchPost(
    url: string,
    body: string,
    options?: { headers?: Record<string, string>; timeoutMs?: number }
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: options?.headers,
        body,
        signal: controller.signal
      });
      const headerObj: Record<string, string | string[]> = {};
      res.headers.forEach((v, k) => { headerObj[k.toLowerCase()] = v; });
      return {
        status: res.status,
        text: () => res.text(),
        headers: headerObj
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
