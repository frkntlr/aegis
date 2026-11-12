import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CodexInstaller } from './codex-installer.js';

test('installed executable works in a workspace with spaces and no npm package', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis runtime '));
  try {
    const engine = path.join(root, 'engine with spaces'), project = path.join(root, 'Game Workspace');
    fs.mkdirSync(path.join(engine, 'packages/cli/dist/bin'), { recursive: true });
    fs.mkdirSync(path.join(engine, 'templates/codex/skills/aegis'), { recursive: true });
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(engine, 'packages/cli/dist/bin/aegis.js'),
      'console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));');
    fs.writeFileSync(path.join(engine, 'templates/codex/AGENTS.md'), 'Preserve project cwd');
    fs.writeFileSync(path.join(engine, 'templates/codex/skills/aegis/SKILL.md'), 'Use installed executable');
    CodexInstaller.install(project, engine);
    const runtime = JSON.parse(fs.readFileSync(path.join(project, '.aegis/installation.json'), 'utf8')) as
      { command: string; args: string[]; cwd: string };
    const objective = 'Timing issue, eye game and 404; literal $(not-a-command)';
    const result = JSON.parse(execFileSync(runtime.command, [...runtime.args, 'teamwork', 'plan', objective],
      { cwd: project, encoding: 'utf8', windowsHide: true }));
    assert.equal(result.cwd, project);
    assert.deepEqual(result.args, ['teamwork', 'plan', objective]);
    assert.equal(fs.existsSync(path.join(project, 'package.json')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
