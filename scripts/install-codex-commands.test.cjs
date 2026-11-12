const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('user install upgrades stale skills, keeps custom rules and is idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis user install '));
  const installer = path.join(__dirname, 'install-codex-commands.cjs');
  try {
    const skill = path.join(root, '.agents/skills/aegis/SKILL.md');
    const agents = path.join(root, '.codex/AGENTS.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.mkdirSync(path.dirname(agents), { recursive: true });
    fs.writeFileSync(skill, 'Old skill');
    fs.writeFileSync(agents, 'Keep my rules\n');
    execFileSync(process.execPath, [installer, root], { windowsHide: true });
    assert.match(fs.readFileSync(skill, 'utf8'), /aegis tw/);
    assert.equal(fs.readFileSync(skill, 'utf8'), fs.readFileSync(
      path.join(__dirname, '../templates/codex/skills/aegis/SKILL.md'), 'utf8'));
    assert.match(fs.readFileSync(skill, 'utf8'), /--client=codex --json/);
    assert.match(fs.readFileSync(skill, 'utf8'), /Dispatch every independent item.*before waiting/);
    assert.match(fs.readFileSync(skill, 'utf8'), /codex:orchestrate create/);
    const runtime = JSON.parse(fs.readFileSync(path.join(path.dirname(skill), 'runtime.json'), 'utf8'));
    assert.equal(runtime.command, process.execPath);
    assert.equal(runtime.args[0], path.resolve(__dirname, '../packages/cli/dist/bin/aegis.js'));
    const first = fs.readFileSync(agents, 'utf8');
    assert.match(first, /^Keep my rules\n/);
    assert.match(first, /aegis tw <objective>/);
    assert.match(first, /active project/);
    assert.match(first, /Dispatch all ready independent workers before waiting/);
    const backups = fs.readdirSync(path.dirname(skill)).filter(f => f.includes('.backup-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(path.dirname(skill), backups[0]), 'utf8'), 'Old skill');
    execFileSync(process.execPath, [installer, root], { windowsHide: true });
    assert.equal(fs.readFileSync(agents, 'utf8'), first);
    assert.equal(fs.readdirSync(path.dirname(agents)).filter(f => f.includes('.backup-')).length, 1);
    assert.equal(fs.readdirSync(path.dirname(skill)).filter(f => f.includes('.backup-')).length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('managed block replacement preserves surrounding rules and explicit home overrides CODEX_HOME', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis custom home '));
  try {
    const agents = path.join(root, '.codex/AGENTS.md');
    const external = path.join(root, 'unused codex home');
    fs.mkdirSync(path.dirname(agents), { recursive: true });
    fs.writeFileSync(agents, 'Before\r\n<!-- aegis:user:start -->\nOld\n<!-- aegis:user:end -->\r\nAfter');
    execFileSync(process.execPath, [path.join(__dirname, 'install-codex-commands.cjs'), root], {
      windowsHide: true, env: { ...process.env, CODEX_HOME: external }
    });
    const text = fs.readFileSync(agents, 'utf8');
    assert.ok(text.startsWith('Before\r\n<!-- aegis:user:start -->'));
    assert.ok(text.endsWith('<!-- aegis:user:end -->\r\nAfter'));
    assert.equal(text.split('<!-- aegis:user:start -->').length, 2);
    assert.equal(fs.existsSync(external), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid managed blocks fail before changing any installed files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis invalid markers '));
  const start = '<!-- aegis:user:start -->';
  const end = '<!-- aegis:user:end -->';
  try {
    const agents = path.join(root, '.codex/AGENTS.md');
    const skill = path.join(root, '.agents/skills/aegis/SKILL.md');
    fs.mkdirSync(path.dirname(agents), { recursive: true });
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    for (const invalid of [start, end, `${end}\n${start}`, `${start}${end}${start}${end}`]) {
      fs.writeFileSync(agents, invalid);
      fs.writeFileSync(skill, 'Preserve installed skill');
      assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, 'install-codex-commands.cjs'), root], {
        windowsHide: true, stdio: 'pipe'
      }), /Invalid Aegis managed markers/);
      assert.equal(fs.readFileSync(agents, 'utf8'), invalid);
      assert.equal(fs.readFileSync(skill, 'utf8'), 'Preserve installed skill');
      assert.equal(fs.readdirSync(path.dirname(skill)).length, 1);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing template aborts before replacing any destination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis missing template '));
  try {
    const engine = path.join(root, 'engine');
    const target = path.join(root, 'target');
    const script = path.join(engine, 'scripts/install-codex-commands.cjs');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'install-codex-commands.cjs'), script);
    const template = path.join(engine, 'templates/codex/skills/aegis/SKILL.md');
    fs.mkdirSync(path.dirname(template), { recursive: true });
    fs.writeFileSync(template, 'New template');
    const installed = path.join(target, '.agents/skills/aegis/SKILL.md');
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.writeFileSync(installed, 'Keep existing');
    assert.throws(() => execFileSync(process.execPath, [script, target], { windowsHide: true, stdio: 'pipe' }), /ENOENT/);
    assert.equal(fs.readFileSync(installed, 'utf8'), 'Keep existing');
    assert.equal(fs.readdirSync(path.dirname(installed)).length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
