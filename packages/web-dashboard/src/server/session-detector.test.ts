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
