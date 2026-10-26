import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NuGetMetadataExtractor } from './nuget-metadata-extractor.js';

test('NuGetMetadataExtractor parses XML companion documentation', () => {
  const xmlContent = `<?xml version="1.0"?>
<doc>
    <members>
        <member name="M:Godot.Node.GetNode(Godot.NodePath)">
            <summary>Fetches a node by NodePath.</summary>
            <param name="path">The NodePath to find.</param>
            <returns>The matching Node or null.</returns>
        </member>
        <member name="T:Godot.CharacterBody3D">
            <summary>3D Physics body for characters.</summary>
        </member>
    </members>
</doc>`;

  const docs = NuGetMetadataExtractor.parseXmlCompanion(xmlContent, 'GodotSharp', '4.3.0');
  assert.strictEqual(docs.length, 2);

  const methodDoc = docs.find(d => d.topic === 'GetNode(Godot.NodePath)');
  assert.ok(methodDoc);
  assert.strictEqual(methodDoc?.library, 'GodotSharp');
  assert.strictEqual(methodDoc?.version, '4.3.0');
  assert.ok(methodDoc?.summary.includes('Fetches a node'));
  assert.ok(methodDoc?.signatures[0].includes('Godot.Node.GetNode(Godot.NodePath) -> The matching Node or null.'));
});

test('NuGetMetadataExtractor parses project.assets.json and locates companion XML', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuget-test-'));
  const nugetStore = path.join(tmpDir, 'global-nuget');
  const pkgDir = path.join(nugetStore, 'godotsharp', '4.3.0', 'lib', 'net8.0');
  fs.mkdirSync(pkgDir, { recursive: true });

  const xmlContent = `<doc><members><member name="M:Godot.GD.Print(System.Object[])"><summary>Prints to output.</summary></member></members></doc>`;
  fs.writeFileSync(path.join(pkgDir, 'GodotSharp.xml'), xmlContent, 'utf8');

  const assetsDir = path.join(tmpDir, 'obj');
  fs.mkdirSync(assetsDir, { recursive: true });
  const assetsJson = {
    libraries: {
      'GodotSharp/4.3.0': {
        type: 'package',
        path: 'godotsharp/4.3.0'
      }
    }
  };
  fs.writeFileSync(path.join(assetsDir, 'project.assets.json'), JSON.stringify(assetsJson), 'utf8');

  const refs = NuGetMetadataExtractor.parseProjectAssets(path.join(assetsDir, 'project.assets.json'), nugetStore);
  assert.strictEqual(refs.length, 1);
  assert.strictEqual(refs[0].name, 'GodotSharp');
  assert.strictEqual(refs[0].version, '4.3.0');

  const docs = NuGetMetadataExtractor.extractFromProject(tmpDir, nugetStore);
  assert.strictEqual(docs.length, 1);
  assert.strictEqual(docs[0].library, 'GodotSharp');
  assert.ok(docs[0].summary.includes('Prints to output.'));
});
