/**
 * @file native-browser-cdp-attacher.ts
 * Lightweight Chrome DevTools Protocol (CDP) attacher for system browsers.
 * Queries active browser session cookies via CDP Network.getCookies with zero Playwright dependency.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface CdpCookieItem {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

export type CdpCommandSender = (
  method: string,
  params?: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export interface CdpAttacherOptions {
  port?: number;
  host?: string;
  timeoutMs?: number;
  sender?: CdpCommandSender;
}

export interface CdpHarvestOptions extends CdpAttacherOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
  autoClose?: boolean;
}

export interface CdpHarvestResult {
  success: boolean;
  cookies?: string;
  hasSid: boolean;
  hasPsidts: boolean;
  error?: string;
}

export class NativeBrowserCdpAttacher {
  public static async isCdpActive(port = 9222, host = '127.0.0.1', timeoutMs = 1000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${host}:${port}/json/version`, { signal: controller.signal });
      return res.status === 200;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  public static async waitForCdp(port = 9222, host = '127.0.0.1', timeoutMs = 15000, intervalMs = 500): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const active = await NativeBrowserCdpAttacher.isCdpActive(port, host, Math.min(intervalMs, 1000));
      if (active) return true;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
  }

  public static async queryCookies(options: CdpAttacherOptions = {}): Promise<string | null> {
    const port = options.port ?? 9222;
    const host = options.host ?? '127.0.0.1';
    const timeoutMs = options.timeoutMs ?? 3000;

    if (options.sender) {
      return NativeBrowserCdpAttacher.executeWithSender(options.sender);
    }

    const active = await NativeBrowserCdpAttacher.isCdpActive(port, host, timeoutMs);
    if (!active) return null;

    const wsUrl = await NativeBrowserCdpAttacher.resolveWebSocketUrl(port, host);
    if (!wsUrl) return null;

    return await NativeBrowserCdpAttacher.fetchViaWebSocket(wsUrl, timeoutMs);
  }

  public static async harvestSessionCookies(options: CdpHarvestOptions = {}): Promise<CdpHarvestResult> {
    const port = options.port ?? 9222;
    const maxWaitMs = options.maxWaitMs ?? 60000;
    const intervalMs = options.pollIntervalMs ?? 1500;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const cookies = await NativeBrowserCdpAttacher.queryCookies(options);
      if (cookies) {
        const hasSid = cookies.includes('SID=') || cookies.includes('__Secure-1PSID=') || cookies.includes('__Secure-3PSID=');
        const hasPsidts = cookies.includes('__Secure-1PSIDTS=') || cookies.includes('__Secure-3PSIDTS=');
        if (hasSid) {
          if (options.autoClose) await NativeBrowserCdpAttacher.closeBrowser(port);
          return { success: true, cookies, hasSid, hasPsidts };
        }
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }

    return { success: false, hasSid: false, hasPsidts: false, error: 'Harvest timed out waiting for Google login.' };
  }

  public static async closeBrowser(port = 9222, host = '127.0.0.1'): Promise<boolean> {
    try {
      const res = await fetch(`http://${host}:${port}/json/version`);
      const json = (await res.json()) as Record<string, unknown>;
      const wsUrl = typeof json.webSocketDebuggerUrl === 'string' ? json.webSocketDebuggerUrl : null;
      if (!wsUrl) return false;

      return await new Promise<boolean>((resolve) => {
        const WebSocketCtor = (globalThis as unknown as Record<string, unknown>)['WebSocket'];
        if (typeof WebSocketCtor !== 'function') return resolve(false);

        const ws = new (WebSocketCtor as new (url: string) => {
          onopen: (() => void) | null;
          send: (d: string) => void;
          close: () => void;
        })(wsUrl);

        ws.onopen = () => {
          ws.send(JSON.stringify({ id: 999, method: 'Browser.close' }));
          setTimeout(() => { ws.close(); resolve(true); }, 200);
        };
      });
    } catch {
      return false;
    }
  }

  public static formatCookies(rawCookies: unknown[]): string {
    const map = new Map<string, string>();
    for (const item of rawCookies) {
      if (typeof item === 'object' && item !== null) {
        const c = item as Record<string, unknown>;
        if (typeof c.name === 'string' && typeof c.value === 'string' && c.name && c.value) {
          map.set(c.name, c.value);
        }
      }
    }
    return Array.from(map.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private static async resolveWebSocketUrl(port: number, host: string): Promise<string | null> {
    try {
      const listRes = await fetch(`http://${host}:${port}/json/list`);
      const listJson = (await listRes.json()) as Array<Record<string, unknown>>;
      const page = listJson.find(p => p.type === 'page' && typeof p.webSocketDebuggerUrl === 'string');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl as string;
    } catch {
      // Fallback to version endpoint
    }

    try {
      const versionRes = await fetch(`http://${host}:${port}/json/version`);
      const json = (await versionRes.json()) as Record<string, unknown>;
      return typeof json.webSocketDebuggerUrl === 'string' ? json.webSocketDebuggerUrl : null;
    } catch {
      return null;
    }
  }

  private static async executeWithSender(sender: CdpCommandSender): Promise<string | null> {
    try {
      const res = await sender('Network.getCookies', {
        urls: ['https://notebooklm.google.com', 'https://notebook.google.com', 'https://accounts.google.com']
      });
      const cookies = Array.isArray(res.cookies) ? res.cookies : [];
      const formatted = NativeBrowserCdpAttacher.formatCookies(cookies);
      return formatted.length > 0 ? formatted : null;
    } catch {
      return null;
    }
  }

  private static parseCdpMessage(data: string): string | null {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      const result = parsed.result as Record<string, unknown> | undefined;
      const cookies = Array.isArray(result?.cookies) ? result.cookies : [];
      return NativeBrowserCdpAttacher.formatCookies(cookies) || null;
    } catch {
      return null;
    }
  }

  private static bindWsEvents(
    ws: { onopen: (() => void) | null; onmessage: ((ev: { data: string }) => void) | null; onerror: (() => void) | null; send: (d: string) => void; close: () => void },
    resolve: (v: string | null) => void,
    timer: NodeJS.Timeout
  ): void {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Network.getCookies',
        params: { urls: ['https://notebooklm.google.com', 'https://notebook.google.com', 'https://accounts.google.com'] }
      }));
    };
    ws.onmessage = (ev) => {
      clearTimeout(timer);
      ws.close();
      resolve(NativeBrowserCdpAttacher.parseCdpMessage(ev.data));
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
  }

  private static async fetchViaWebSocket(wsUrl: string, timeoutMs: number): Promise<string | null> {
    const WebSocketCtor = (globalThis as unknown as Record<string, unknown>)['WebSocket'];
    if (typeof WebSocketCtor !== 'function') return null;

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      try {
        const ws = new (WebSocketCtor as new (url: string) => {
          onopen: (() => void) | null;
          onmessage: ((ev: { data: string }) => void) | null;
          onerror: (() => void) | null;
          send: (d: string) => void;
          close: () => void;
        })(wsUrl);
        NativeBrowserCdpAttacher.bindWsEvents(ws, resolve, timer);
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
}
