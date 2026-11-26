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
    const srcSkill = path.join(tmpRepo, 'templates', 'skills', 'aegis');
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

test('AntigravityInstaller installShims emits aegis-tr instead of tr and discoverHomes avoids hardcoded user paths', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-shims-homes-'));
  try {
    const binDir = path.join(tmpRoot, 'bin');
    AntigravityInstaller.installShims(binDir, path.join(tmpRoot, 'aegis.js'));
    assert.strictEqual(fs.existsSync(path.join(binDir, 'tr.cmd')), false);
    assert.strictEqual(fs.existsSync(path.join(binDir, 'tr.ps1')), false);
    assert.strictEqual(fs.existsSync(path.join(binDir, 'tr')), false);
    assert.strictEqual(fs.existsSync(path.join(binDir, 'aegis-tr.cmd')), true);
    assert.strictEqual(fs.existsSync(path.join(binDir, 'aegis-tr.ps1')), true);

    const fakeHome = path.join(tmpRoot, 'home');
    const profileHome = path.join(fakeHome, 'AntigravityProfiles', 'client-x');
    fs.mkdirSync(path.join(fakeHome, '.gemini'), { recursive: true });
    fs.mkdirSync(path.join(profileHome, '.gemini'), { recursive: true });

    const prevEnv = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME, ANTIGRAVITY_APP_DATA_DIR: process.env.ANTIGRAVITY_APP_DATA_DIR };
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    delete process.env.ANTIGRAVITY_APP_DATA_DIR;
    try {
      const homes = AntigravityInstaller.discoverHomes(fakeHome);
      assert.deepStrictEqual(homes, [path.resolve(fakeHome), path.resolve(profileHome)]);
      assert.strictEqual(homes.some(h => h.endsWith(`${path.sep}client-a`)), false);
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('AntigravityInstaller syncGlobal installs shims into APPDATA npm dir and invokes MCP registration', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-sync-global-'));
  const prevEnv = {
    USERPROFILE: process.env.USERPROFILE,
    HOME: process.env.HOME,
    APPDATA: process.env.APPDATA,
    ANTIGRAVITY_APP_DATA_DIR: process.env.ANTIGRAVITY_APP_DATA_DIR
  };
  try {
    const fakeHome = path.join(tmpRoot, 'home');
    const fakeAppData = path.join(tmpRoot, 'appdata');
    const fakeNpmDir = path.join(fakeAppData, 'npm');
    const fakeRepo = path.join(tmpRoot, 'repo');
    fs.mkdirSync(path.join(fakeHome, '.gemini'), { recursive: true });
    fs.mkdirSync(fakeNpmDir, { recursive: true });
    fs.mkdirSync(fakeRepo, { recursive: true });
    fs.writeFileSync(path.join(fakeRepo, 'GEMINI.md'), '# Rules', 'utf8');

    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    process.env.APPDATA = fakeAppData;
    delete process.env.ANTIGRAVITY_APP_DATA_DIR;

    const registeredConfigs: string[] = [];
    AntigravityInstaller.syncGlobal(fakeHome, fakeRepo, cfg => registeredConfigs.push(cfg));

    assert.ok(registeredConfigs.includes(path.resolve(fakeHome, '.gemini', 'config', 'mcp_config.json')));
    assert.strictEqual(fs.existsSync(path.join(fakeHome, '.gemini', 'antigravity', 'bin', 'aegis-tr.cmd')), true);
    assert.strictEqual(fs.existsSync(path.join(fakeHome, '.gemini', 'antigravity', 'bin', 'tr.cmd')), false);
    if (process.platform === 'win32') {
      assert.strictEqual(fs.existsSync(path.join(fakeNpmDir, 'aegis.cmd')), true);
      assert.strictEqual(fs.existsSync(path.join(fakeNpmDir, 'tr.cmd')), false);
    }
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
