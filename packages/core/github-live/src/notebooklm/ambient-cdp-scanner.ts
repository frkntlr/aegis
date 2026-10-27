/**
 * @file ambient-cdp-scanner.ts
 * Multi-Port Ambient CDP Auto-Discovery & Zero-Click Session Harvester for Google NotebookLM.
 * Scans localhost ports (9222-9229) for active Google tabs and extracts session cookies.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { NativeBrowserCdpAttacher, type CdpCommandSender } from './native-browser-cdp-attacher.js';
import { SessionCredentialsManager } from './session-credentials-manager.js';

export interface CdpPageTarget {
  id: string;
  type: string;
  url: string;
  title: string;
  webSocketDebuggerUrl?: string;
}

export interface AmbientCdpScanResult {
  port: number;
  available: boolean;
  googleTabs: CdpPageTarget[];
}

export interface AmbientHarvestResult {
  success: boolean;
  cookies?: string;
  port?: number;
  matchedUrl?: string;
  error?: string;
}

export interface ScannerOptions {
  ports?: number[];
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  sender?: CdpCommandSender;
}

const DEFAULT_PORTS = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229];

export class AmbientCdpScanner {
  public static isGoogleUrl(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('notebooklm.google.com') ||
      lower.includes('notebook.google.com') ||
      lower.includes('accounts.google.com') ||
      lower.includes('.google.com')
    );
  }

  public static filterGoogleTargets(targets: CdpPageTarget[]): CdpPageTarget[] {
    return targets.filter(t => t.type === 'page' && AmbientCdpScanner.isGoogleUrl(t.url));
  }

  public static async probePort(
    port: number,
    timeoutMs = 150,
    fetchFn = fetch
  ): Promise<AmbientCdpScanResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchFn(`http://127.0.0.1:${port}/json/list`, {
        signal: controller.signal
      });
      if (!res.ok) {
        return { port, available: false, googleTabs: [] };
      }
      const raw = (await res.json()) as CdpPageTarget[];
      const googleTabs = AmbientCdpScanner.filterGoogleTargets(raw);
      return { port, available: true, googleTabs };
    } catch {
      return { port, available: false, googleTabs: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  public static async scanAllPorts(options: ScannerOptions = {}): Promise<AmbientCdpScanResult[]> {
    const ports = options.ports || DEFAULT_PORTS;
    const results: AmbientCdpScanResult[] = [];

    for (const port of ports) {
      const res = await AmbientCdpScanner.probePort(port, options.timeoutMs ?? 150, options.fetchFn);
      results.push(res);
      if (res.available && res.googleTabs.length > 0) {
        break; // Fast-path exit when an active Google tab is located
      }
    }

    return results;
  }

  public static async harvestFromPort(
    port: number,
    sender?: CdpCommandSender
  ): Promise<AmbientHarvestResult> {
    const rawCookies = await NativeBrowserCdpAttacher.queryCookies({ port, sender });
    if (!rawCookies) {
      return { success: false, port, error: `No cookies returned by CDP port ${port}` };
    }

    const val = SessionCredentialsManager.validateCookieString(rawCookies);
    if (!val.valid) {
      return {
        success: false,
        port,
        error: `Incomplete tokens on port ${port}. Missing: ${val.missingTokens.join(', ')}`
      };
    }

    return { success: true, cookies: rawCookies, port };
  }

  public static async discoverAndHarvest(options: ScannerOptions = {}): Promise<AmbientHarvestResult> {
    const scanResults = await AmbientCdpScanner.scanAllPorts(options);
    const available = scanResults.filter(r => r.available);

    if (available.length === 0) {
      return { success: false, error: 'No active Chromium browser CDP interface found on localhost.' };
    }

    const withGoogle = available.find(r => r.googleTabs.length > 0);
    const targetPort = withGoogle ? withGoogle.port : available[0].port;
    const matchedUrl = withGoogle?.googleTabs[0]?.url;

    const res = await AmbientCdpScanner.harvestFromPort(targetPort, options.sender);
    return { ...res, matchedUrl };
  }
}
