/**
 * @file system-browser-detector.ts
 * Detects installed Chromium-family system browsers across Windows, macOS, and Linux.
 * Supports Chrome, Edge, Brave, Vivaldi, Opera, and Chromium with zero heavy dependencies.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type BrowserName = 'chrome' | 'edge' | 'brave' | 'vivaldi' | 'opera' | 'chromium';

export interface DetectedBrowser {
  name: BrowserName;
  executablePath: string;
}

export class SystemBrowserDetector {
  public static detectInstalledBrowser(
    preferredName?: BrowserName | string,
    customPaths?: string[],
    platform = process.platform
  ): DetectedBrowser | null {
    const installed = SystemBrowserDetector.listInstalledBrowsers(customPaths, platform);
    if (installed.length === 0) return null;

    if (preferredName) {
      const normalized = preferredName.toLowerCase();
      const match = installed.find(b => b.name === normalized || b.executablePath.toLowerCase().includes(normalized));
      if (match) return match;
    }

    return installed[0] || null;
  }

  public static listInstalledBrowsers(customPaths?: string[], platform = process.platform): DetectedBrowser[] {
    const found: DetectedBrowser[] = [];
    const seen = new Set<string>();

    if (customPaths && customPaths.length > 0) {
      for (const p of customPaths) {
        if (fs.existsSync(p) && !seen.has(p)) {
          seen.add(p);
          found.push({ name: SystemBrowserDetector.inferBrowserName(p), executablePath: p });
        }
      }
    }

    const candidates = SystemBrowserDetector.getCandidatePaths(platform);
    for (const c of candidates) {
      if (fs.existsSync(c.executablePath) && !seen.has(c.executablePath)) {
        seen.add(c.executablePath);
        found.push(c);
      }
    }

    return found;
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
    if (lower.includes('vivaldi')) return 'vivaldi';
    if (lower.includes('opera')) return 'opera';
    if (lower.includes('chromium')) return 'chromium';
    return 'chrome';
  }

  private static getWindowsCandidates(): DetectedBrowser[] {
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || '';

    const paths: Array<{ name: BrowserName; sub: string }> = [
      { name: 'chrome', sub: path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { name: 'chrome', sub: path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { name: 'edge', sub: path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { name: 'edge', sub: path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { name: 'brave', sub: path.join(progFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') },
      { name: 'vivaldi', sub: path.join(progFiles, 'Vivaldi', 'Application', 'vivaldi.exe') },
      { name: 'opera', sub: path.join(progFiles, 'Opera', 'launcher.exe') }
    ];

    if (localAppData) {
      paths.push({ name: 'chrome', sub: path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') });
      paths.push({ name: 'edge', sub: path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe') });
      paths.push({ name: 'vivaldi', sub: path.join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe') });
      paths.push({ name: 'opera', sub: path.join(localAppData, 'Programs', 'Opera', 'opera.exe') });
      paths.push({ name: 'opera', sub: path.join(localAppData, 'Programs', 'Opera GX', 'opera.exe') });
    }

    return paths.map(p => ({ name: p.name, executablePath: p.sub }));
  }

  private static getDarwinCandidates(): DetectedBrowser[] {
    return [
      { name: 'chrome', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { name: 'edge', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { name: 'brave', executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
      { name: 'vivaldi', executablePath: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi' },
      { name: 'opera', executablePath: '/Applications/Opera.app/Contents/MacOS/Opera' }
    ];
  }

  private static getLinuxCandidates(): DetectedBrowser[] {
    return [
      { name: 'chrome', executablePath: '/usr/bin/google-chrome' },
      { name: 'chrome', executablePath: '/usr/bin/google-chrome-stable' },
      { name: 'edge', executablePath: '/usr/bin/microsoft-edge' },
      { name: 'brave', executablePath: '/usr/bin/brave-browser' },
      { name: 'vivaldi', executablePath: '/usr/bin/vivaldi' },
      { name: 'opera', executablePath: '/usr/bin/opera' },
      { name: 'chromium', executablePath: '/usr/bin/chromium' },
      { name: 'chromium', executablePath: '/usr/bin/chromium-browser' }
    ];
  }
}
