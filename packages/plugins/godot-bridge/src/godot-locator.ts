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
      candidates.push(
        'C:\\Program Files\\Godot\\Godot Console.exe',
        'C:\\Program Files\\Godot\\Godot.exe'
      );
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        candidates.push(
          path.join(localAppData, 'Godot', 'Godot Console.exe'),
          path.join(localAppData, 'Godot', 'Godot.exe')
        );
      }
    } else {
      candidates.push('/usr/local/bin/godot', '/usr/bin/godot');
    }
    return candidates;
  }

  private static resolveFromSystemPath(): string | null {
    try {
      const cmd = process.platform === 'win32' ? 'where.exe godot' : 'which godot';
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
