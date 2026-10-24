import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface GodotInstallation {
  binaryPath: string;
  versionString: string;
  majorVersion: number;
  isHeadlessCapable: boolean;
}

export class GodotLocator {
  public static findGodot(configuredPath?: string): GodotInstallation | null {
    const candidates = this.collectCandidates(configuredPath);
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const info = this.inspectBinary(p);
        if (info) return info;
      }
    }
    return null;
  }

  private static collectCandidates(configuredPath?: string): string[] {
    const candidates: string[] = [];
    if (configuredPath) candidates.push(configuredPath);
    if (process.env.GODOT_PATH) candidates.push(process.env.GODOT_PATH);

    const fromPath = this.resolveFromSystemPath();
    if (fromPath) candidates.push(fromPath);

    if (process.platform === 'win32') {
      candidates.push(...this.collectWindowsCandidates());
    } else {
      candidates.push('/usr/local/bin/godot', '/usr/bin/godot', '/opt/godot/godot');
    }
    return candidates;
  }

  private static collectWindowsCandidates(): string[] {
    const list: string[] = [
      'C:\\Program Files\\Godot\\Godot Console.exe',
      'C:\\Program Files\\Godot\\Godot.exe'
    ];
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      list.push(
        path.join(localAppData, 'Godot', 'Godot Console.exe'),
        path.join(localAppData, 'Godot', 'Godot.exe'),
        ...this.scanWingetGodot(localAppData)
      );
    }
    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
      list.push(path.join(userProfile, 'scoop', 'apps', 'godot', 'current', 'godot.exe'));
    }
    return list;
  }

  private static scanWingetGodot(localAppData: string): string[] {
    const wingetDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (!fs.existsSync(wingetDir)) return [];
    try {
      const pkg = fs.readdirSync(wingetDir).find(d => d.startsWith('GodotEngine.GodotEngine'));
      if (!pkg) return [];
      const fullPkg = path.join(wingetDir, pkg);
      const exes = fs.readdirSync(fullPkg).filter(f => f.toLowerCase().endsWith('.exe'));
      const consoleExe = exes.find(f => f.toLowerCase().includes('console'));
      const found: string[] = [];
      if (consoleExe) found.push(path.join(fullPkg, consoleExe));
      for (const e of exes) found.push(path.join(fullPkg, e));
      return found;
    } catch {
      return [];
    }
  }

  private static resolveFromSystemPath(): string | null {
    try {
      if (process.platform === 'win32') {
        const out = execSync('where.exe "Godot*"', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
          .toString()
          .trim();
        const lines = out.split(/\r?\n/).map(l => l.trim()).filter(l => l.toLowerCase().endsWith('.exe') && fs.existsSync(l));
        const consoleExe = lines.find(l => l.toLowerCase().includes('console'));
        return consoleExe || lines[0] || null;
      }
      const cmd = 'which godot';
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
        .toString()
        .trim();
      const firstLine = out.split(/\r?\n/)[0]?.trim();
      return firstLine && fs.existsSync(firstLine) ? firstLine : null;
    } catch {
      return null;
    }
  }

  public static inspectBinary(binaryPath: string): GodotInstallation | null {
    try {
      const out = execSync(`"${binaryPath}" --version`, {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000
      })
        .toString()
        .trim();

      const majorMatch = out.match(/^(\d+)/);
      const majorVersion = majorMatch ? parseInt(majorMatch[1], 10) : 4;
      const isConsole = binaryPath.toLowerCase().includes('console') || process.platform !== 'win32';

      return {
        binaryPath,
        versionString: out,
        majorVersion,
        isHeadlessCapable: isConsole
      };
    } catch {
      return null;
    }
  }
}
