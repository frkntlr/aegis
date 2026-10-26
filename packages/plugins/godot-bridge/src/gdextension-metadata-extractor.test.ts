import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GdExtensionMetadataExtractor } from './gdextension-metadata-extractor.js';

test('GdExtensionMetadataExtractor parses INI manifest', () => {
  const manifest = `
[configuration]
entry_symbol = "steam_api_init"
compatibility_minimum = "4.2"

[libraries]
windows.debug.x86_64 = "bin/steam.dll"
`;
  const res = GdExtensionMetadataExtractor.parseGdExtensionManifest(manifest);
  assert.strictEqual(res.entrySymbol, 'steam_api_init');
  assert.strictEqual(res.compatibilityMinimum, '4.2');
});

function setupTestAddon(tmpDir: string): void {
  const addonDir = path.join(tmpDir, 'addons', 'my_plugin');
  fs.mkdirSync(addonDir, { recursive: true });
  fs.writeFileSync(
    path.join(addonDir, 'my_plugin.gdextension'),
    '[configuration]\nentry_symbol = "init_my_plugin"\ncompatibility_minimum = "4.3"\n',
    'utf8'
  );
  const gd = 'class_name CustomVehicle\nextends CharacterBody3D\nsignal engine_started(rpm: float)\nfunc start_engine(key: bool) -> void:\n    pass\n';
  fs.writeFileSync(path.join(addonDir, 'vehicle.gd'), gd, 'utf8');
  const hpp = '#pragma once\nclass NativePhysics : public RefCounted {\n    GDCLASS(NativePhysics, RefCounted);\npublic:\n    void step(float delta);\n};\n';
  fs.writeFileSync(path.join(addonDir, 'physics.hpp'), hpp, 'utf8');
}

test('GdExtensionMetadataExtractor extracts project addon contracts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdext-test-'));
  setupTestAddon(tmpDir);
  const contracts = GdExtensionMetadataExtractor.extractFromProject(tmpDir);
  assert.strictEqual(contracts.length, 1);
  assert.strictEqual(contracts[0].pluginName, 'my_plugin');
  assert.strictEqual(contracts[0].entrySymbol, 'init_my_plugin');
  assert.strictEqual(contracts[0].compatibilityMinimum, '4.3');
});

test('GdExtensionMetadataExtractor extracts GDScript and C++ classes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdext-classes-'));
  setupTestAddon(tmpDir);
  const contracts = GdExtensionMetadataExtractor.extractFromProject(tmpDir);
  const names = contracts[0].classes.map(c => c.name);
  assert.ok(names.includes('CustomVehicle'));
  assert.ok(names.includes('NativePhysics'));
  const vehicle = contracts[0].classes.find(c => c.name === 'CustomVehicle');
  assert.strictEqual(vehicle?.inherits, 'CharacterBody3D');
  assert.ok(vehicle?.signals.includes('engine_started'));
});
