import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('codex:setup configures an external project with spaces and its MCP command actually runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis codex project '));
  const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const cli = path.join(engine, 'packages/cli/dist/bin/aegis.js');
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"codex-fixture","private":true}');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Keep custom project rules\n');
    execFileSync(process.execPath, [cli, 'codex:setup', root], { cwd: root, timeout: 10000, windowsHide: true });
    const first = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    assert.ok(first.includes('Keep custom project rules'));
    assert.ok(first.includes('Aegis project instructions for Codex'));
    execFileSync(process.execPath, [cli, 'codex:setup', root], { cwd: root, timeout: 10000, windowsHide: true });
    assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), first);
    const result = execFileSync(process.execPath, [path.join(engine, 'scripts/verify-codex-mcp.cjs'), root], {
      cwd: engine, timeout: 18000, encoding: 'utf8', windowsHide: true
    });
    assert.ok(result.includes('lock_status passed'));
    assert.ok(result.includes(`cwd=${root}`));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
