import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ALL_AEGIS_COMMANDS,
  generatePowerShellCompletion,
  generateBashCompletion,
  installToProfile,
  installToBinScript,
  handleCompletion
} from './completion-command.js';

test('ALL_AEGIS_COMMANDS includes key subcommands and aliases', () => {
  assert.ok(ALL_AEGIS_COMMANDS.includes('tw'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('tw:plan'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('tr'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('tr:plan'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('tw:status'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('tw:compact'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('tw:clear'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('status'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('task:list'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('completion'));
  assert.ok(ALL_AEGIS_COMMANDS.includes('search'));
});

test('generatePowerShellCompletion creates valid ArgumentCompleter script', () => {
  const script = generatePowerShellCompletion(['tw', 'status', 'auto']);
  assert.ok(script.includes('Register-ArgumentCompleter'));
  assert.ok(script.includes("'tw'"));
  assert.ok(script.includes("'status'"));
  assert.ok(script.includes('CompletionResult'));
});

test('generateBashCompletion creates valid bash complete function', () => {
  const script = generateBashCompletion(['tw', 'status']);
  assert.ok(script.includes('complete -F _aegis_completions aegis'));
  assert.ok(script.includes('compgen -W'));
});

test('installToProfile safely appends script without duplicating', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-profile-test-'));
  const fakeProfile = path.join(tmpDir, 'profile.ps1');
  try {
    const ok1 = installToProfile(fakeProfile);
    assert.strictEqual(ok1, true);
    assert.ok(fs.existsSync(fakeProfile));
    const content1 = fs.readFileSync(fakeProfile, 'utf8');
    assert.ok(content1.includes('Register-ArgumentCompleter'));

    // Second run should be idempotent
    const ok2 = installToProfile(fakeProfile);
    assert.strictEqual(ok2, true);
    const content2 = fs.readFileSync(fakeProfile, 'utf8');
    assert.strictEqual(content1, content2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('installToBinScript safely injects into bin launcher', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-bin-test-'));
  const fakeBin = path.join(tmpDir, 'aegis.ps1');
  fs.writeFileSync(fakeBin, '& node "path/to/aegis.js" @args\n', 'utf8');
  try {
    const ok1 = installToBinScript(fakeBin);
    assert.strictEqual(ok1, true);
    const content1 = fs.readFileSync(fakeBin, 'utf8');
    assert.ok(content1.includes('Register-ArgumentCompleter'));
    assert.ok(content1.includes('& node "path/to/aegis.js" @args'));

    // Second run should be idempotent
    const ok2 = installToBinScript(fakeBin);
    assert.strictEqual(ok2, true);
    const content2 = fs.readFileSync(fakeBin, 'utf8');
    assert.strictEqual(content1, content2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleCompletion runs without errors for shells', () => {
  assert.doesNotThrow(() => handleCompletion('powershell'));
  assert.doesNotThrow(() => handleCompletion('bash'));
  assert.doesNotThrow(() => handleCompletion());
});
