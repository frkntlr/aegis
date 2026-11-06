import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AntigravityInstaller } from './antigravity-installer.js';

test('AntigravityInstaller cleanLegacy removes legacy skills, duplicate configs and aegis_aegis', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-clean-legacy-'));
  try {
    const legacySkills = [
      '.gemini/config/skills/ajan1',
      '.gemini/config/skills/ajan2',
      '.gemini/config/skills/durum',
      '.gemini/config/skills/solver',
      '.gemini/config/skills/qa',
      '.gemini/config/skills/aegis',
      '.gemini/config/skills/tw',
      '.gemini/antigravity/mcp/aegis_aegis',
      '.gemini/config/plugins/aegis/mcp_config.json'
    ];
    for (const rel of legacySkills) {
      const full = path.join(tmpDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, 'dummy', 'utf8');
    }

    AntigravityInstaller.cleanLegacy(tmpDir);

    for (const rel of legacySkills) {
      assert.strictEqual(fs.existsSync(path.join(tmpDir, rel)), false, `Expected ${rel} to be deleted`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AntigravityInstaller installPlugin installs skills to plugin dir without polluting standalone skills', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-inst-home-'));
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-inst-repo-'));
  try {
    const srcSkill = path.join(tmpRepo, '.agents', 'skills', 'aegis');
    fs.mkdirSync(srcSkill, { recursive: true });
    fs.writeFileSync(path.join(srcSkill, 'SKILL.md'), '---\nname: aegis\n---\n# Aegis', 'utf8');
    fs.writeFileSync(path.join(tmpRepo, 'GEMINI.md'), '# Aegis Rules', 'utf8');

    AntigravityInstaller.installPlugin(tmpHome, tmpRepo);

    const pluginSkillPath = path.join(tmpHome, '.gemini', 'config', 'plugins', 'aegis', 'skills', 'aegis', 'SKILL.md');
    const standaloneSkillPath = path.join(tmpHome, '.gemini', 'config', 'skills', 'aegis', 'SKILL.md');
    const rulesPath = path.join(tmpHome, '.gemini', 'config', 'plugins', 'aegis', 'rules', 'AGENTS.md');

    assert.strictEqual(fs.existsSync(pluginSkillPath), true, 'Plugin skill should exist');
    assert.strictEqual(fs.existsSync(rulesPath), true, 'AGENTS.md should exist');
    assert.strictEqual(fs.existsSync(standaloneSkillPath), false, 'Standalone skill should NOT be created');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('AntigravityInstaller writeMcpSchemas writes valid schemas', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mcp-schema-'));
  try {
    AntigravityInstaller.writeMcpSchemas(tmpDir);
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
    assert.ok(files.length >= 25, `Expected >= 25 schemas, got ${files.length}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
