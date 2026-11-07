import { test } from 'node:test';
import * as assert from 'node:assert';
import { TeamworkHierarchicalTree } from './teamwork-hierarchical-tree.js';
import { TeamworkDecomposer } from './teamwork-decomposer.js';

test('detectSelectedRoles does NOT filter out all roles when agents are merely mentioned', () => {
  const obj1 = 'qa hunter ve issue solver koordineli çalışsın';
  assert.strictEqual(TeamworkHierarchicalTree.detectSelectedRoles(obj1), null);

  const obj2 = 'issue solver kodları refactor etsin, testleri tamamla';
  assert.strictEqual(TeamworkHierarchicalTree.detectSelectedRoles(obj2), null);

  const obj3 = 'ui specialist yeni pause menu hazırlasın';
  assert.strictEqual(TeamworkHierarchicalTree.detectSelectedRoles(obj3), null);
});

test('detectSelectedRoles strictly restricts roles when explicit or restrictive keywords are used', () => {
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('sadece qa testleri koşsun'), ['qa']);
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('yalnızca solver mantığı yazsın'), ['solver']);
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('only ui layouts please'), ['ui']);
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('sadece doc dokümantasyonu'), ['docs']);
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('test suite --role=qa'), ['qa']);
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('run --only=solver'), ['solver']);
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('qa hunter altında 4 ajan'), ['qa']);
  assert.deepStrictEqual(TeamworkHierarchicalTree.detectSelectedRoles('any task', 'qa'), ['qa']);
});

test('extractLabel replaces meaningless single words with architectural fallback labels', () => {
  const labelTam = TeamworkDecomposer.extractLabel('Tam', 'solver');
  assert.ok(!labelTam.toLowerCase().includes('tam'));
  assert.ok(['MultiAgent', 'TaskSharder', 'PerformanceRadar', 'MeshProtocol', 'GateAudit'].includes(labelTam));

  const labelGorevi = TeamworkDecomposer.extractLabel('Görevi', 'solver');
  assert.ok(!labelGorevi.toLowerCase().includes('görev'));
  assert.ok(['MultiAgent', 'TaskSharder', 'PerformanceRadar', 'MeshProtocol', 'GateAudit'].includes(labelGorevi));

  const labelBununla = TeamworkDecomposer.extractLabel('Bununla ilgili çalışma', 'solver');
  assert.ok(!labelBununla.toLowerCase().includes('bununla'));
  assert.ok(['MultiAgent', 'TaskSharder', 'PerformanceRadar', 'MeshProtocol', 'GateAudit'].includes(labelBununla));
});

test('extractLabel preserves meaningful words after filtering out stop words', () => {
  const label = TeamworkDecomposer.extractLabel('tam performans iyileştirmesi', 'solver');
  assert.strictEqual(label, 'Performans');

  const labelSharder = TeamworkDecomposer.extractLabel('dağıtık görev yönetimi', 'solver');
  assert.strictEqual(labelSharder, 'Dağıtık');
});
