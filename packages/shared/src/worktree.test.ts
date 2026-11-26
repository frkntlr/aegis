import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  cleanGitEnv,
  resolveSafeAegisDir,
  resolveSafeCacheDir,
  resolveSafeRepoRoot
} from './worktree.js';

test('resolveSafeRepoRoot prefers explicit path and AEGIS_WORKSPACE when existing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-worktree-root-'));
  const prevWorkspace = process.env.AEGIS_WORKSPACE;
  try {
    const explicitDir = path.join(tmpDir, 'explicit');
    const envDir = path.join(tmpDir, 'env-ws');
    fs.mkdirSync(explicitDir, { recursive: true });
    fs.mkdirSync(envDir, { recursive: true });
    process.env.AEGIS_WORKSPACE = envDir;
    assert.equal(resolveSafeRepoRoot(explicitDir), path.resolve(explicitDir));
    assert.equal(resolveSafeRepoRoot(path.join(tmpDir, 'missing')), path.resolve(envDir));
  } finally {
    if (prevWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = prevWorkspace;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveSafeRepoRoot respects temp cwd and walks ancestor repo markers outside temp', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-worktree-anc-'));
  const prevCwd = process.cwd();
  const prevWorkspace = process.env.AEGIS_WORKSPACE;
  try {
    delete process.env.AEGIS_WORKSPACE;
    process.chdir(tmpDir);
    assert.equal(resolveSafeRepoRoot(), fs.realpathSync(tmpDir));

    const pkgSrc = path.resolve(prevCwd, 'src');
    if (fs.existsSync(pkgSrc)) {
      process.chdir(pkgSrc);
      const detected = resolveSafeRepoRoot();
      assert.equal(
        fs.existsSync(path.join(detected, '.git')) || fs.existsSync(path.join(detected, 'packages')),
        true
      );
    }
    assert.equal(resolveSafeAegisDir(tmpDir), path.join(path.resolve(tmpDir), '.aegis'));
    assert.equal(resolveSafeCacheDir('ast', tmpDir), path.join(path.resolve(tmpDir), '.aegis', 'cache', 'ast'));
    assert.equal(resolveSafeCacheDir('', tmpDir), path.join(path.resolve(tmpDir), '.aegis', 'cache'));
  } finally {
    process.chdir(prevCwd);
    if (prevWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = prevWorkspace;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cleanGitEnv strips GIT_* overrides and sets GIT_TERMINAL_PROMPT=0 without mutating process.env', () => {
  const prevDir = process.env.GIT_DIR;
  const prevWorkTree = process.env.GIT_WORK_TREE;
  const prevPrompt = process.env.GIT_TERMINAL_PROMPT;
  try {
    process.env.GIT_DIR = '/tmp/fake.git';
    process.env.GIT_WORK_TREE = '/tmp/fake';
    const cleaned = cleanGitEnv();
    assert.equal(cleaned.GIT_TERMINAL_PROMPT, '0');
    assert.equal(cleaned.GIT_DIR, undefined);
    assert.equal(cleaned.GIT_INDEX_FILE, undefined);
    assert.equal(cleaned.GIT_WORK_TREE, undefined);
    assert.equal(cleaned.GIT_PREFIX, undefined);
    assert.equal(cleaned.GIT_COMMON_DIR, undefined);
    assert.equal(process.env.GIT_DIR, '/tmp/fake.git');
  } finally {
    if (prevDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = prevDir;
    if (prevWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = prevWorkTree;
    if (prevPrompt === undefined) delete process.env.GIT_TERMINAL_PROMPT;
    else process.env.GIT_TERMINAL_PROMPT = prevPrompt;
  }
});
