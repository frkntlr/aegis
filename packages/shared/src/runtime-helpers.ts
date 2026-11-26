import * as fs from 'node:fs';
import * as path from 'node:path';

export interface NpmInvocation {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

export interface ResolveNpmOptions {
  platform?: NodeJS.Platform;
  npmCliPath?: string | null;
}

export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return String(err);
  } catch {
    return 'Unknown error';
  }
}

export function debugLogIgnored(scope: string, err: unknown): void {
  if (process.env.AEGIS_DEBUG !== '1') return;
  process.stderr.write(`[aegis:${scope}] ${formatErrorMessage(err)}\n`);
}

/**
 * Quotes an argument for a single-pass Windows `cmd.exe /d /s /c` invocation.
 * Callers passing a quoted or space-containing first executable token must wrap
 * the entire command line in outer `"..."` for `/s`. For `.cmd`/`.bat` batch
 * targets (which re-parse `%*`), use {@link quoteWinBatchArg} instead.
 */
export function quoteWinCmdArg(arg: string): string {
  if (/[\0\r\n]/.test(arg)) {
    throw new Error('Windows command argument contains unsupported control characters');
  }
  if (arg.length === 0) return '""';
  if (!/[\s"&|<>^()%!;*?]/.test(arg)) return arg;
  const escaped = arg
    .replace(/(\\*)"/g, '$1$1"\\^""')
    .replace(/(\\+)$/, '$1$1')
    .replace(/(\\*)([%!])/g, '$1$1"^$2"');
  return `"${escaped}"`;
}

/**
 * Quotes an argument for Windows `.cmd`/`.bat` batch invocations under
 * `cmd.exe /d /s /c`. Fails closed on `"` (as well as `\0`, `\r`, `\n`) because
 * batch `%*` expansion triggers a second `cmd.exe` parse that strips `^`.
 */
export function quoteWinBatchArg(arg: string): string {
  if (/[\0\r\n"]/.test(arg)) {
    throw new Error('Windows batch argument contains unsupported quotes or control characters');
  }
  return quoteWinCmdArg(arg);
}

function findNpmCliInPath(): string | null {
  const pathEnv = process.env.PATH || process.env.Path || '';
  if (!pathEnv) return null;
  const cmdNames = process.platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm'];
  for (const rawDir of pathEnv.split(path.delimiter)) {
    const dir = rawDir.trim().replace(/^"+|"+$/g, '');
    if (!dir) continue;
    const hasNpm = cmdNames.some((name) => fs.existsSync(path.join(dir, name)));
    if (!hasNpm) continue;
    const candidates = [
      path.resolve(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    ];
    const match = candidates.find((candidate) => fs.existsSync(candidate));
    if (match) return match;
  }
  return null;
}

function findNpmCliJs(): string | null {
  const envExec = process.env.npm_execpath;
  if (envExec && path.basename(envExec).toLowerCase() === 'npm-cli.js' && fs.existsSync(envExec)) {
    return envExec;
  }
  const execDir = path.dirname(process.execPath);
  const candidates = [
    path.resolve(execDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(execDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(execDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? findNpmCliInPath();
}

export function resolveNpmInvocation(args: string[], options: ResolveNpmOptions = {}): NpmInvocation {
  const npmCli = options.npmCliPath === undefined ? findNpmCliJs() : options.npmCliPath;
  if (npmCli) {
    return { command: process.execPath, args: [npmCli, ...args] };
  }
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    const commandLine = ['npm.cmd', ...args].map(quoteWinBatchArg).join(' ');
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', commandLine],
      windowsVerbatimArguments: true
    };
  }
  return { command: 'npm', args: [...args] };
}
