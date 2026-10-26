/**
 * @file system-browser-detector.ts
 * Detects installed system browsers (Edge, Chrome, Brave) across Windows, macOS, and Linux.
 * Eliminates the need to download 400MB Playwright Chromium binaries.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type BrowserName = 'chrome' | 'edge' | 'brave' | 'chromium';

export interface DetectedBrowser {
  name: BrowserName;
  executablePath: string;
}

export class SystemBrowserDetector {
  public static detectInstalledBrowser(customPaths?: string[], platform = process.platform): DetectedBrowser | null {
    if (customPaths && customPaths.length > 0) {
      for (const p of customPaths) {
        if (fs.existsSync(p)) {
          return { name: SystemBrowserDetector.inferBrowserName(p), executablePath: p };
        }
      }
    }
    const candidates = SystemBrowserDetector.getCandidatePaths(platform);
    for (const c of candidates) {
      if (fs.existsSync(c.executablePath)) return c;
    }
    return null;
  }

  public static getCandidatePaths(platform = process.platform): DetectedBrowser[] {
    if (platform === 'win32') return SystemBrowserDetector.getWindowsCandidates();
    if (platform === 'darwin') return SystemBrowserDetector.getDarwinCandidates();
    return SystemBrowserDetector.getLinuxCandidates();
  }

  public static inferBrowserName(filePath: string): BrowserName {
    const lower = filePath.toLowerCase();
    if (lower.includes('edge') || lower.includes('msedge')) return 'edge';
    if (lower.includes('brave')) return 'brave';
    if (lower.includes('chromium')) return 'chromium';
    return 'chrome';
  }

  private static getWindowsCandidates(): DetectedBrowser[] {
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || '';

    const paths: Array<{ name: BrowserName; sub: string }> = [
      { name: 'edge', sub: path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { name: 'edge', sub: path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { name: 'chrome', sub: path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { name: 'chrome', sub: path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { name: 'brave', sub: path.join(progFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') }
    ];

    if (localAppData) {
      paths.push({ name: 'chrome', sub: path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') });
      paths.push({ name: 'edge', sub: path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe') });
    }

    return paths.map(p => ({ name: p.name, executablePath: p.sub }));
  }

  private static getDarwinCandidates(): DetectedBrowser[] {
    return [
      { name: 'chrome', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { name: 'edge', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { name: 'brave', executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' }
    ];
  }

  private static getLinuxCandidates(): DetectedBrowser[] {
    return [
      { name: 'chrome', executablePath: '/usr/bin/google-chrome' },
      { name: 'chrome', executablePath: '/usr/bin/google-chrome-stable' },
      { name: 'edge', executablePath: '/usr/bin/microsoft-edge' },
      { name: 'brave', executablePath: '/usr/bin/brave-browser' },
      { name: 'chromium', executablePath: '/usr/bin/chromium' },
      { name: 'chromium', executablePath: '/usr/bin/chromium-browser' }
    ];
  }
}
