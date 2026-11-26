import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, quoteWinBatchArg } from '@aegis/shared';

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

function validateIdeInputs(options: LaunchIdeOptions): { absWorktree: string; absFocus?: string } {
  if (!options.worktreePath || !options.worktreePath.trim() || /[\0\r\n]/.test(options.worktreePath)) {
    throw new Error('Invalid worktreePath for IDE launch');
  }
  const absWorktree = path.resolve(options.worktreePath);
  if (options.focusFile === undefined) {
    return { absWorktree };
  }
  if (/[\0\r\n]/.test(options.focusFile) || options.focusFile.trim().startsWith('-')) {
    throw new Error('Invalid focusFile for IDE launch');
  }
  const absFocus = path.resolve(absWorktree, options.focusFile);
  const rel = path.relative(absWorktree, absFocus);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error('focusFile escapes worktreePath');
  }
  return { absWorktree, absFocus };
}

function isRegularFile(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch (err: unknown) {
    debugLogIgnored('IdeLauncher:isRegularFile', err);
    return false;
  }
}

export function resolveWindowsBinary(bin: string): string {
  if (process.platform !== 'win32') return bin;
  const exts = ['.com', '.exe', '.cmd', '.bat'];
  if (/[/\\]/.test(bin)) {
    if (path.extname(bin)) return bin;
    const match = exts.map(ext => `${bin}${ext}`).find(isRegularFile);
    return match ?? bin;
  }
  const hasExt = Boolean(path.extname(bin));
  const pathEnv = process.env.PATH || process.env.Path || '';
  for (const rawDir of pathEnv.split(path.delimiter)) {
    const dir = rawDir.trim().replace(/^"+|"+$/g, '');
    if (!dir) continue;
    const candidates = hasExt ? [path.join(dir, bin)] : exts.map(ext => path.join(dir, `${bin}${ext}`));
    const found = candidates.find(isRegularFile);
    if (found) return found;
  }
  return bin;
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
        if (!proc || Number.isNaN(proc.pid)) continue;
        if (proc.exe.includes('cursor')) {
          list.push({ pid: proc.pid, name: 'Cursor AI', ideType: 'Cursor AI', executable: proc.originalExe });
        } else if (proc.exe.includes('antigravity')) {
          list.push({ pid: proc.pid, name: 'Google Antigravity', ideType: 'Google Antigravity', executable: proc.originalExe });
        } else if (proc.exe === 'code.exe' || proc.exe === 'code') {
          list.push({ pid: proc.pid, name: 'VS Code', ideType: 'VS Code', executable: proc.originalExe });
        }
      }
    } catch (err: unknown) {
      debugLogIgnored('IdeLauncher:detectRunningIdes', err);
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
    const { absWorktree, absFocus } = validateIdeInputs(options);
    const bin = this.resolveCommand(options.ideType);
    if (absFocus) {
      return `${bin} "${absWorktree}" -g "${absFocus}"`;
    }
    return `${bin} "${absWorktree}"`;
  }

  public launchIde(options: LaunchIdeOptions): LaunchIdeResult {
    let cmd = '';
    try {
      const { absWorktree, absFocus } = validateIdeInputs(options);
      const bin = this.resolveCommand(options.ideType);
      cmd = absFocus ? `${bin} "${absWorktree}" -g "${absFocus}"` : `${bin} "${absWorktree}"`;
      const args = absFocus ? [absWorktree, '-g', absFocus] : [absWorktree];

      const child = this.spawnDetached(bin, args);
      child.on('error', (err) => debugLogIgnored('IdeLauncher:spawn', err));
      child.unref();

      return {
        success: true,
        command: cmd,
        message: `${options.ideType} başlatıldı: ${options.worktreePath}`,
        pid: child.pid
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, command: cmd, message: `IDE başlatılamadı (${msg}). Komut: ${cmd}` };
    }
  }

  private spawnDetached(bin: string, args: string[]) {
    if (process.platform !== 'win32') {
      return spawn(bin, args, { detached: true, stdio: 'ignore', shell: false });
    }
    const resolvedBin = resolveWindowsBinary(bin);
    if (/\.(cmd|bat)$/i.test(resolvedBin)) {
      const inner = [resolvedBin, ...args].map(quoteWinBatchArg).join(' ');
      const cmdLine = inner.startsWith('"') ? `"${inner}"` : inner;
      return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdLine], {
        detached: true, stdio: 'ignore', windowsHide: true, shell: false, windowsVerbatimArguments: true
      });
    }
    return spawn(resolvedBin, args, { detached: true, stdio: 'ignore', windowsHide: true, shell: false });
  }
}
