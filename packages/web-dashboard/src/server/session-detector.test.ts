import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionDetector } from './session-detector.js';

function createTempRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-session-test-'));
  fs.mkdirSync(path.join(tmpDir, 'worktrees', 'solver', '.cursor'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'worktrees', 'qa', '.zed'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'worktrees', 'docs', '.vscode'), { recursive: true });
  return tmpDir;
}

test('SessionDetector detects IDE types correctly from worktree configs', () => {
  const repo = createTempRepo();
  try {
    const detector = new SessionDetector(repo);
    const sessions = detector.detectSessions();
    const solver = sessions.find(s => s.agentName === 'solver');
    const qa = sessions.find(s => s.agentName === 'qa');
    const docs = sessions.find(s => s.agentName === 'docs');

    assert.strictEqual(solver?.ideType, 'Cursor AI');
    assert.strictEqual(qa?.ideType, 'Zed Editor');
    assert.strictEqual(docs?.ideType, 'Google Antigravity');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('SessionDetector handles heartbeat registration and corrupt session files', () => {
  const repo = createTempRepo();
  try {
    const detector = new SessionDetector(repo);
    detector.registerHeartbeat('solver', 'VS Code');
    let sessions = detector.detectSessions();
    let solver = sessions.find(s => s.agentName === 'solver');
    assert.strictEqual(solver?.ideType, 'VS Code');

    const corruptPath = path.resolve(repo, '.aegis', 'sessions', 'solver.json');
    fs.writeFileSync(corruptPath, '{ corrupt json', 'utf8');

    sessions = detector.detectSessions();
    solver = sessions.find(s => s.agentName === 'solver');
    assert.strictEqual(solver?.ideType, 'Cursor AI');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('SessionDetector strictly enforces Cursor priority over Zed when both markers exist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ide-priority-'));
  try {
    const multiDir = path.join(tmpDir, 'multi-agent');
    fs.mkdirSync(path.join(multiDir, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(multiDir, '.zed'), { recursive: true });
    fs.mkdirSync(path.join(multiDir, '.vscode'), { recursive: true });

    const detector = new SessionDetector(tmpDir);
    assert.strictEqual(detector.detectIdeType(multiDir), 'Cursor AI');

    const zedVscodeDir = path.join(tmpDir, 'zed-vscode');
    fs.mkdirSync(path.join(zedVscodeDir, '.zed'), { recursive: true });
    fs.mkdirSync(path.join(zedVscodeDir, '.vscode'), { recursive: true });
    assert.strictEqual(detector.detectIdeType(zedVscodeDir), 'Zed Editor');

    const rulesDir = path.join(tmpDir, 'cursorrules-zed');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, '.cursorrules'), '# rules', 'utf8');
    fs.mkdirSync(path.join(rulesDir, '.zed'), { recursive: true });
    assert.strictEqual(detector.detectIdeType(rulesDir), 'Cursor AI');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
