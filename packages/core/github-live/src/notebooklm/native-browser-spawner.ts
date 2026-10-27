/**
 * @file native-browser-spawner.ts
 * Spawns native Chromium-family browsers with isolated user-data-dir and CDP port binding.
 * Guarantees true visible desktop window rendering without conflicting with active personal browsing.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  SystemBrowserDetector,
  type BrowserName,
  type DetectedBrowser
} from './system-browser-detector.js';

export interface BrowserSpawnOptions {
  browserName?: BrowserName | string;
  browserPath?: string;
  port?: number;
  userDataDir?: string;
  url?: string;
  spawner?: (
    command: string,
    args: string[],
    options: Record<string, unknown>
  ) => { unref: () => void; pid?: number };
}

export interface BrowserSpawnResult {
  success: boolean;
  pid?: number;
  port: number;
  browser?: DetectedBrowser;
  userDataDir: string;
  error?: string;
}

export class NativeBrowserSpawner {
  public static resolveUserDataDir(browserName: string): string {
    const safeName = browserName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const dir = path.join(os.homedir(), '.aegis', 'browser-profiles', safeName || 'default');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public static buildArgs(port: number, userDataDir: string, url: string): string[] {
    return [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      url
    ];
  }

  public static spawn(options: BrowserSpawnOptions = {}): BrowserSpawnResult {
    const custom = options.browserPath ? [options.browserPath] : undefined;
    const browser = SystemBrowserDetector.detectInstalledBrowser(options.browserName, custom);

    const port = options.port ?? 9222;
    const fallbackDir = path.join(os.homedir(), '.aegis', 'browser-profiles', 'default');
    const userDataDir = options.userDataDir ?? (browser ? NativeBrowserSpawner.resolveUserDataDir(browser.name) : fallbackDir);

    if (!browser) {
      return { success: false, port, userDataDir, error: 'No compatible Chromium-family browser detected on host system.' };
    }

    const url = options.url ?? 'https://notebooklm.google.com';
    const args = NativeBrowserSpawner.buildArgs(port, userDataDir, url);

    try {
      const spawner = options.spawner ?? child_process.spawn;
      const child = spawner(browser.executablePath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();

      return {
        success: true,
        pid: child.pid,
        port,
        browser,
        userDataDir
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, port, browser, userDataDir, error: `Failed to spawn browser process: ${msg}` };
    }
  }
}
