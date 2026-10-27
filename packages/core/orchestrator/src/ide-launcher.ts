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
  private cachedRunningIdes: { timestamp: number; list: RunningIdeProcess[] } | null = null;
  private readonly CACHE_TTL_MS = 3000;

  constructor(customExecutables?: Record<string, string>) {
    if (customExecutables) {
      for (const [k, v] of Object.entries(customExecutables)) {
        this.customCommands.set(k.toLowerCase(), v);
      }
    }
  }

  private parseProcessLine(trimmed: string, isWin: boolean): { exe: string; pid: number; originalExe: string } | null {
    if (isWin) {
      const parts = trimmed.split(',').map(p => p.replace(/"/g, '').trim());
      if (parts.length < 2) return null;
      return { originalExe: parts[0], exe: parts[0].toLowerCase(), pid: parseInt(parts[1], 10) };
    }
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!match) return null;
    return { originalExe: match[2], exe: match[2].toLowerCase(), pid: parseInt(match[1], 10) };
  }

  public detectRunningIdes(forceRefresh = false): RunningIdeProcess[] {
    const now = Date.now();
    if (!forceRefresh && this.cachedRunningIdes && (now - this.cachedRunningIdes.timestamp < this.CACHE_TTL_MS)) {
      return this.cachedRunningIdes.list;
    }
    const list: RunningIdeProcess[] = [];
    try {
      const isWin = process.platform === 'win32';
      const output = isWin
        ? execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
        : execFileSync('ps', ['-eo', 'pid,comm'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      for (const line of output.split('\n')) {
        const proc = this.parseProcessLine(line.trim(), isWin);
        if (!proc || isNaN(proc.pid)) continue;

        if (proc.exe.includes('cursor')) {
          list.push({ pid: proc.pid, name: 'Cursor AI', ideType: 'Cursor AI', executable: proc.originalExe });
        } else if (proc.exe.includes('antigravity')) {
          list.push({ pid: proc.pid, name: 'Google Antigravity', ideType: 'Google Antigravity', executable: proc.originalExe });
        } else if (proc.exe === 'code.exe' || proc.exe === 'code') {
          list.push({ pid: proc.pid, name: 'VS Code', ideType: 'VS Code', executable: proc.originalExe });
        }
      }
    } catch {
      // Fallback on systems where tasklist is restricted
    }
    this.cachedRunningIdes = { timestamp: now, list };
    return list;
  }

  private resolveCommand(ideType: string): string {
    const key = ideType.toLowerCase();
    const custom = this.customCommands.get(key);
    if (custom) return custom;
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        command: cmd,
        message: `IDE başlatılamadı (${msg}). Komut: ${cmd}`
      };
    }
  }
}
