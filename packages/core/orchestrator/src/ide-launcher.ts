import { execFileSync, spawn } from 'node:child_process';
import * as path from 'node:path';

export interface RunningIdeProcess {
  pid: number;
  name: string;
  ideType: 'Google Antigravity' | 'Cursor AI' | 'VS Code' | 'Universal IDE';
  executable: string;
}

export interface LaunchIdeOptions {
  ideType: 'Google Antigravity' | 'Cursor AI' | 'VS Code' | 'Universal IDE';
  worktreePath: string;
  focusFile?: string;
}

export interface LaunchIdeResult {
  success: boolean;
  command: string;
  message: string;
  pid?: number;
}

export class IdeLauncher {
  private customCommands: Map<string, string> = new Map();

  constructor(customExecutables?: Record<string, string>) {
    if (customExecutables) {
      for (const [k, v] of Object.entries(customExecutables)) {
        this.customCommands.set(k.toLowerCase(), v);
      }
    }
  }

  public detectRunningIdes(): RunningIdeProcess[] {
    const list: RunningIdeProcess[] = [];
    try {
      const isWin = process.platform === 'win32';
      const output = isWin
        ? execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
        : execFileSync('ps', ['-eo', 'pid,comm'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = output.split('\n');
      for (const line of lines) {
        const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
        if (parts.length < 2) continue;
        const exe = parts[0].toLowerCase();
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid)) continue;

        if (exe.includes('cursor')) {
          list.push({ pid, name: 'Cursor AI', ideType: 'Cursor AI', executable: parts[0] });
        } else if (exe.includes('antigravity')) {
          list.push({ pid, name: 'Google Antigravity', ideType: 'Google Antigravity', executable: parts[0] });
        } else if (exe === 'code.exe' || exe === 'code') {
          list.push({ pid, name: 'VS Code', ideType: 'VS Code', executable: parts[0] });
        }
      }
    } catch {
      // Fallback on systems where tasklist is restricted
    }
    return list;
  }

  private resolveCommand(ideType: string): string {
    const key = ideType.toLowerCase();
    if (this.customCommands.has(key)) return this.customCommands.get(key)!;
    if (key.includes('cursor')) return 'cursor';
    if (key.includes('antigravity')) return 'antigravity';
    return 'code';
  }

  public buildLaunchCommand(options: LaunchIdeOptions): string {
    const bin = this.resolveCommand(options.ideType);
    const absPath = path.resolve(options.worktreePath);
    if (options.focusFile) {
      const absFile = path.resolve(absPath, options.focusFile);
      return `${bin} "${absPath}" -g "${absFile}"`;
    }
    return `${bin} "${absPath}"`;
  }

  public launchIde(options: LaunchIdeOptions): LaunchIdeResult {
    const cmd = this.buildLaunchCommand(options);
    try {
      const bin = this.resolveCommand(options.ideType);
      const args = [path.resolve(options.worktreePath)];
      if (options.focusFile) args.push('-g', path.resolve(options.worktreePath, options.focusFile));

      const child = spawn(bin, args, {
        detached: true,
        stdio: 'ignore',
        shell: true
      });
      child.unref();

      return {
        success: true,
        command: cmd,
        message: `${options.ideType} başlatıldı: ${options.worktreePath}`,
        pid: child.pid
      };
    } catch (err: any) {
      return {
        success: false,
        command: cmd,
        message: `IDE başlatılamadı (${err.message}). Komut: ${cmd}`
      };
    }
  }
}
