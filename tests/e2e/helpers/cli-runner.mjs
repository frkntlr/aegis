import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const CLI_BIN = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'aegis.js');

export function buildCleanEnv(extraEnv = {}) {
  const env = { ...process.env, CI: 'true', GIT_TERMINAL_PROMPT: '0' };
  delete env.NODE_ENV;
  delete env.AEGIS_TEST;
  delete env.NODE_TEST_CONTEXT;
  for (const [key, val] of Object.entries(extraEnv)) {
    if (val === undefined) delete env[key];
    else env[key] = val;
  }
  return env;
}

export function runExec(command, args, opts = {}) {
  const res = spawnSync(command, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: buildCleanEnv(opts.env),
    timeout: opts.timeoutMs ?? 20000,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    shell: opts.shell ?? false
  });
  const timedOut = res.error?.code === 'ETIMEDOUT';
  const status = res.status ?? (res.error ? 1 : 0);
  return {
    status,
    signal: res.signal ?? null,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    timedOut,
    error: res.error ? res.error.message : null
  };
}

export function runNode(args, opts = {}) {
  return runExec(process.execPath, args, opts);
}

export function runAegisCli(args, opts = {}) {
  return runNode([CLI_BIN, ...args], opts);
}

export function runNpm(args, opts = {}) {
  if (process.platform === 'win32') {
    return runExec('cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], opts);
  }
  return runExec('npm', args, opts);
}

export function createTempWorkspace(prefix = 'aegis-e2e-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function cleanGitEnvOverrides(extraEnv = {}) {
  return {
    GIT_DIR: undefined,
    GIT_INDEX_FILE: undefined,
    GIT_WORK_TREE: undefined,
    GIT_PREFIX: undefined,
    GIT_COMMON_DIR: undefined,
    ...extraEnv
  };
}

export function runGit(args, cwd, opts = {}) {
  return runExec('git', args, {
    ...opts,
    cwd,
    env: cleanGitEnvOverrides(opts.env)
  });
}

export function initTempGitRepo(dir, opts = {}) {
  const initRes = runGit(['init'], dir);
  if (initRes.status !== 0) throw new Error(`git init failed: ${initRes.stderr}`);
  runGit(['config', 'user.email', 'e2e@aegis.local'], dir);
  runGit(['config', 'user.name', 'Aegis E2E'], dir);
  if (opts.initialCommit !== false) {
    const keepPath = path.join(dir, '.gitkeep');
    if (!fs.existsSync(keepPath)) fs.writeFileSync(keepPath, '', 'utf8');
    runGit(['add', '.gitkeep'], dir);
    const commitRes = runGit(['commit', '-m', 'init'], dir);
    if (commitRes.status !== 0) throw new Error(`git commit failed: ${commitRes.stderr}`);
  }
}

export function hasUtf8Bom(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(3);
    const bytesRead = fs.readSync(fd, buf, 0, 3, 0);
    return bytesRead >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  } finally {
    fs.closeSync(fd);
  }
}

export function readPackageJson(pkgRelPath) {
  const fullPath = path.isAbsolute(pkgRelPath)
    ? pkgRelPath
    : path.join(REPO_ROOT, pkgRelPath);
  const raw = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}
