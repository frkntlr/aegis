import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkDocSharder } from './teamwork-doc-sharder.js';
import { TeamworkDocSynthesizer } from './teamwork-doc-synthesizer.js';
import { TeamworkDecomposer } from './teamwork-decomposer.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';

test('TeamworkDocSharder partitions files strictly disjoint across specialists', () => {
  const files = [
    'README.md',
    'wiki/Home.md',
    'wiki/Sidebar.md',
    'docs/rfc/001-sharding.md',
    'docs/adr/002-mesh.md',
    'docs/architecture.md',
    'docs/components.md',
    'src/index.ts'
  ];

  const partitioned = TeamworkDocSharder.partitionDocFiles(files);

  assert.deepStrictEqual(partitioned.readme, ['README.md']);
  assert.deepStrictEqual(partitioned.wiki, ['wiki/Home.md', 'wiki/Sidebar.md']);
  assert.deepStrictEqual(partitioned.rfc, ['docs/rfc/001-sharding.md', 'docs/adr/002-mesh.md']);
  assert.deepStrictEqual(partitioned.arch, ['docs/architecture.md', 'docs/components.md']);

  const allAssigned = [
    ...partitioned.readme,
    ...partitioned.wiki,
    ...partitioned.rfc,
    ...partitioned.arch
  ];
  const unique = new Set(allAssigned);
  assert.strictEqual(allAssigned.length, unique.size, 'No file should be duplicated across specialists');
  assert.strictEqual(allAssigned.includes('src/index.ts'), false, 'Non-doc files must be excluded');
});

test('TeamworkDocSharder shards single doc task into 4 parallel specialists in Phase 3', () => {
  const subtasks: DecomposedSubtask[] = [
    { roleType: 'solver', label: 'Core', title: 'Core logic', targetFiles: ['src/core.ts'], phase: 1, dependsOn: [] },
    { roleType: 'qa', label: 'Audit', title: 'Audit suite', targetFiles: ['src/core.test.ts'], phase: 2, dependsOn: ['Core'] },
    { roleType: 'docs', label: 'Docs', title: 'System specs', targetFiles: [], phase: 3, dependsOn: ['Audit'] }
  ];

  const files = ['README.md', 'wiki/Home.md', 'docs/rfc/001.md', 'docs/arch.md'];
  TeamworkDocSharder.shardDocsBySpecialists(subtasks, files, 'System specs', 12);

  const docs = subtasks.filter(t => t.roleType === 'docs');
  assert.strictEqual(docs.length, 4);

  const labels = docs.map(d => d.label).sort();
  assert.deepStrictEqual(labels, ['Architecture', 'RFC', 'Readme', 'Wiki']);

  for (const d of docs) {
    assert.strictEqual(d.phase, 3);
    assert.ok(d.dependsOn?.includes('Audit'));
  }
});

test('TeamworkDocSharder respects maxConcurrency and ignores non-doc tasks', () => {
  const subtasks: DecomposedSubtask[] = [
    { roleType: 'docs', label: 'Docs', title: 'Specs', targetFiles: [], phase: 3, dependsOn: [] }
  ];

  // maxConcurrency = 1 should not shard
  TeamworkDocSharder.shardDocsBySpecialists(subtasks, ['README.md'], 'Specs', 1);
  assert.strictEqual(subtasks.length, 1);
  assert.strictEqual(subtasks[0].label, 'Docs');

  // maxConcurrency = 2 should cap to 2 specialists
  TeamworkDocSharder.shardDocsBySpecialists(subtasks, ['README.md', 'wiki/Home.md'], 'Specs', 2);
  assert.strictEqual(subtasks.length, 2);
});

test('TeamworkDocSynthesizer updateReadme creates README.md with architecture block', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-doc-create-test-'));
  try {
    const synthesizer = new TeamworkDocSynthesizer(tmpDir);
    const result = synthesizer.updateReadme('test-plan-001');

    assert.strictEqual(result.created, true);
    assert.strictEqual(result.updated, true);
    assert.strictEqual(fs.existsSync(result.path), true);

    const content = fs.readFileSync(result.path, 'utf8');
    assert.ok(content.includes('<!-- AEGIS:ARCHITECTURE:START -->'));
    assert.ok(content.includes('<!-- AEGIS:ARCHITECTURE:END -->'));
    assert.ok(content.includes('Aegis Living Architecture'));
    assert.ok(content.includes('Demir Kafes Compliance'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkDocSynthesizer updateReadme surgically updates existing markers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-doc-update-test-'));
  try {
    const readmePath = path.join(tmpDir, 'README.md');
    const initialContent = `# My Project\n\nIntro description\n\n<!-- AEGIS:ARCHITECTURE:START -->\nOld content\n<!-- AEGIS:ARCHITECTURE:END -->\n\nFooter note\n`;
    fs.writeFileSync(readmePath, initialContent, 'utf8');

    const synthesizer = new TeamworkDocSynthesizer(tmpDir);
    const result = synthesizer.updateReadme('test-plan-002');

    assert.strictEqual(result.created, false);
    assert.strictEqual(result.updated, true);

    const updated = fs.readFileSync(readmePath, 'utf8');
    assert.ok(updated.startsWith('# My Project\n\nIntro description'));
    assert.ok(updated.includes('<!-- AEGIS:ARCHITECTURE:START -->'));
    assert.ok(updated.includes('<!-- AEGIS:ARCHITECTURE:END -->'));
    assert.ok(!updated.includes('Old content'));
    assert.ok(updated.includes('Footer note'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkDecomposer decomposes objective with concurrent Phase 3 doc specialists', () => {
  const objective = '1. Parser implement et; 2. UI hazırla; 3. QA audit yap; 4. Dokümantasyon ve Wiki güncelle';
  const files = ['src/parser.ts', 'res://ui.tscn', 'README.md', 'wiki/Architecture.md'];

  const subtasks = TeamworkDecomposer.decompose(objective, files);

  const docTasks = subtasks.filter(t => t.roleType === 'docs');
  assert.ok(docTasks.length >= 2, `Expected at least 2 doc specialists, got ${docTasks.length}`);

  const qaTasks = subtasks.filter(t => t.roleType === 'qa');
  assert.ok(qaTasks.length >= 1);

  for (const d of docTasks) {
    assert.strictEqual(d.phase, 3);
    for (const qa of qaTasks) {
      assert.ok(d.dependsOn?.includes(qa.label), `Doc specialist ${d.label} must depend on QA ${qa.label}`);
    }
  }
});
