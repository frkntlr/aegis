import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActiveHeadResolver } from './active-head-resolver.js';

function withTempRepo(fn: (root: string) => void): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-head-resolver-'));
  try {
    fs.mkdirSync(path.join(tmpDir, '.aegis'), { recursive: true });
    fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('ActiveHeadResolver resolves worktree from BOM-prefixed array worktrees.json', () => {
  withTempRepo((root) => {
    const wtPath = path.join(root, 'experimental', 'solver-alpha');
    fs.mkdirSync(path.join(wtPath, 'src'), { recursive: true });
    const payload = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify([{ agentName: 'solver-alpha', path: wtPath }]), 'utf8')
    ]);
    fs.writeFileSync(path.join(root, '.aegis', 'worktrees.json'), payload);
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(wtPath, root), 'solver-alpha');
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(path.join(wtPath, 'src'), root), 'solver-alpha');
  });
});

test('ActiveHeadResolver resolves object { worktrees } entries using name or basename', () => {
  withTempRepo((root) => {
    const wtPath = path.join(root, 'custom-dir');
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aegis', 'worktrees.json'),
      JSON.stringify({ worktrees: [{ name: 'qa-team', path: wtPath }] })
    );
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(wtPath, root), 'qa-team');
  });
});

test('ActiveHeadResolver logs ignored corrupt worktrees.json when AEGIS_DEBUG=1', () => {
  withTempRepo((root) => {
    fs.writeFileSync(path.join(root, '.aegis', 'worktrees.json'), '{not valid');
    const prevDebug = process.env.AEGIS_DEBUG;
    const origWrite = process.stderr.write.bind(process.stderr);
    const logs: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      process.env.AEGIS_DEBUG = '1';
      const resolved = ActiveHeadResolver.resolveActiveWorktree(path.join(root, 'plain'), root);
      assert.equal(resolved, 'default');
      assert.equal(logs.some((l) => l.includes('[aegis:active-head-resolver]')), true);
    } finally {
      process.stderr.write = origWrite;
      if (prevDebug === undefined) delete process.env.AEGIS_DEBUG;
      else process.env.AEGIS_DEBUG = prevDebug;
    }
  });
});

test('ActiveHeadResolver falls back to path segment, suffix heuristics, and default', () => {
  withTempRepo((root) => {
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(path.join(root, 'worktrees', 'ui-lead'), root), 'ui-lead');
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(path.join(root, 'app-solver'), root), 'solver');
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(path.join(root, 'app-qa'), root), 'qa');
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(path.join(root, 'app-docs'), root), 'docs');
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(path.join(root, 'app-ui'), root), 'ui');
    assert.equal(ActiveHeadResolver.resolveActiveWorktree(path.join(root, 'main-branch'), root), 'default');
  });
});
