import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NotebookLmBridge } from './notebooklm-bridge.js';
import { RfcTriager } from './rfc-triager.js';

test('NotebookLmBridge exports structured research notes from RFCs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-nlm-test-'));
  try {
    const bridge = new NotebookLmBridge(tmpDir);
    const triager = new RfcTriager();
    const rfc = triager.parseRfc('RFC: Add Kotlin AST Support', 'Kotlin vibe coding support');

    const res = bridge.exportRfcResearchNote(rfc);
    assert.ok(fs.existsSync(res.filePath));
    assert.ok(res.markdownContent.includes('NotebookLM Research Note: Kotlin'));
    assert.ok(res.markdownContent.includes('LanguageExtractor'));

    const loaded = bridge.getResearchNote('Kotlin');
    assert.ok(loaded?.includes('Kotlin (LANGUAGE)'));
    assert.strictEqual(bridge.listResearchNotes().length, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
