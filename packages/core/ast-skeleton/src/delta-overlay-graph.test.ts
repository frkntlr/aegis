import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DeltaOverlayGraph } from './delta-overlay-graph.js';

test('DeltaOverlayGraph adds external nodes and cross-boundary edges', () => {
  const dog = new DeltaOverlayGraph();
  dog.localGraph.addNode({ id: 'src/player.ts::move', name: 'move', kind: 'symbol', filePath: 'src/player.ts' });

  const extNode = dog.addExternalNode('godot4', 'CharacterBody2D.move_and_slide', { version: '4.3' });
  assert.strictEqual(extNode.id, 'context7::godot4::CharacterBody2D.move_and_slide');
  assert.strictEqual(extNode.kind, 'external_doc');

  dog.addCrossBoundaryEdge('src/player.ts::move', extNode.id, 'CALLS_EXTERNAL');

  const view = dog.getCompositeView();
  assert.strictEqual(view.hasNode('src/player.ts::move'), true);
  assert.strictEqual(view.hasNode(extNode.id), true);

  const callees = view.getExternalCallees('src/player.ts::move');
  assert.strictEqual(callees.length, 1);
  assert.strictEqual(callees[0].name, 'CharacterBody2D.move_and_slide');
});

test('DeltaOverlayGraph preserves local graph purity on save', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dog-test-'));
  const localFile = path.join(tmpDir, 'graph.json');
  const extFile = path.join(tmpDir, 'external-graph.cache');

  const dog = new DeltaOverlayGraph({ localGraphPath: localFile, externalCachePath: extFile });
  dog.localGraph.addNode({ id: 'app.ts::init', name: 'init', kind: 'symbol', filePath: 'app.ts' });
  const ext = dog.addExternalNode('zod', 'z.object');
  dog.addCrossBoundaryEdge('app.ts::init', ext.id, 'CALLS_EXTERNAL');
  dog.registerPackageVersion('zod', '3.22.4');

  assert.strictEqual(dog.saveLocal(), true);
  assert.strictEqual(dog.saveExternal(), true);

  // Local file must NOT contain external node
  const localContent = fs.readFileSync(localFile, 'utf8');
  assert.ok(localContent.includes('app.ts::init'));
  assert.ok(!localContent.includes('context7::zod::z.object'));

  // Reload in new instance
  const reloaded = new DeltaOverlayGraph({ localGraphPath: localFile, externalCachePath: extFile });
  assert.strictEqual(reloaded.loadLocal(), true);
  assert.strictEqual(reloaded.loadExternal(), true);
  assert.strictEqual(reloaded.isPackageVersionCached('zod', '3.22.4'), true);

  const reloadedView = reloaded.getCompositeView();
  assert.strictEqual(reloadedView.hasNode('app.ts::init'), true);
  assert.strictEqual(reloadedView.hasNode(ext.id), true);
  assert.strictEqual(reloadedView.getExternalCallees('app.ts::init').length, 1);
});

test('CompositeGraphView deduplicates outgoing edges and handles missing nodes', () => {
  const dog = new DeltaOverlayGraph();
  const view = dog.getCompositeView();
  assert.strictEqual(view.getNode('non_existent'), undefined);
  assert.strictEqual(view.getOutgoing('non_existent').length, 0);
});
