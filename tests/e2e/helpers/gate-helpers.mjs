import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { CLI_BIN, REPO_ROOT, buildCleanEnv } from './cli-runner.mjs';
import { getFreePort, waitForHttpReady } from './net-helpers.mjs';

export function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n')
    : (normalized ? normalized.split('\n') : []);
  return lines.length;
}

export function writeTempModuleWithTest(dir, relSrc, srcCode, relTest, testCode) {
  const srcPath = path.join(dir, relSrc);
  const testPath = path.join(dir, relTest);
  fs.mkdirSync(path.dirname(srcPath), { recursive: true });
  fs.mkdirSync(path.dirname(testPath), { recursive: true });
  fs.writeFileSync(srcPath, srcCode, 'utf8');
  fs.writeFileSync(testPath, testCode, 'utf8');
  return { srcPath, testPath };
}

function killProcessTree(child) {
  if (!child || child.exitCode !== null || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    child.once('exit', done);
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      child.kill('SIGTERM');
    }
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve();
    }, 1000).unref();
  });
}

export async function spawnDashboardServer(port, repoRoot, opts = {}) {
  const targetPort = port === 0 || !port ? await getFreePort() : port;
  const env = buildCleanEnv({
    NODE_ENV: 'test',
    AEGIS_WORKSPACE: repoRoot,
    ...(opts.env ?? {})
  });
  const child = spawn(process.execPath, [CLI_BIN, 'dashboard', String(targetPort)], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let logs = '';
  child.stdout?.on('data', (d) => { logs += d.toString(); });
  child.stderr?.on('data', (d) => { logs += d.toString(); });
  const url = `http://127.0.0.1:${targetPort}`;
  try {
    await waitForHttpReady(`${url}/api/status`, opts.timeoutMs ?? 8000);
  } catch (err) {
    await killProcessTree(child);
    throw new Error(`${err.message}\nServer logs:\n${logs}`);
  }
  return {
    port: targetPort,
    url,
    child,
    stop: () => killProcessTree(child)
  };
}

export function listAllWorkspacePackages() {
  const pkgDirs = [];
  const scanLevel = (relBase) => {
    const abs = path.join(REPO_ROOT, relBase);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgFile = path.join(abs, entry.name, 'package.json');
      if (fs.existsSync(pkgFile)) {
        pkgDirs.push(`${relBase}/${entry.name}/package.json`.replace(/\\/g, '/'));
      }
    }
  };
  scanLevel('packages');
  scanLevel('packages/core');
  scanLevel('packages/plugins');
  return pkgDirs.sort();
}

export function collectFiles(rootDir, exts, excludeDirs = ['node_modules', 'dist', '.git', 'experimental']) {
  const extSet = new Set(exts.map((e) => e.toLowerCase()));
  const skipSet = new Set(excludeDirs);
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipSet.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (extSet.has(path.extname(entry.name).toLowerCase())) {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  walk(rootDir);
  return out.sort();
}
