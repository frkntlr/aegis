import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readJsonSafe, safeParseJson, stripBom } from './json-safe.js';

test('stripBom removes leading UTF-8 BOM only', () => {
  assert.equal(stripBom('\uFEFF{"ok":true}'), '{"ok":true}');
  assert.equal(stripBom('{"ok":true}'), '{"ok":true}');
  assert.equal(stripBom('a\uFEFFb'), 'a\uFEFFb');
  assert.equal(stripBom(''), '');
});

test('safeParseJson parses BOM-prefixed JSON strings', () => {
  const parsed = safeParseJson<{ name: string; count: number }>('\uFEFF{"name":"aegis","count":3}');
  assert.deepEqual(parsed, { name: 'aegis', count: 3 });
  assert.throws(() => safeParseJson('\uFEFF{bad json'), SyntaxError);
});

test('readJsonSafe reads UTF-8 BOM file from disk and throws on missing file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-json-safe-'));
  try {
    const bomFile = path.join(tmpDir, 'bom.json');
    const bomBytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('{"enabled":true,"items":[1,2]}', 'utf8')
    ]);
    fs.writeFileSync(bomFile, bomBytes);
    const data = readJsonSafe<{ enabled: boolean; items: number[] }>(bomFile);
    assert.deepEqual(data, { enabled: true, items: [1, 2] });
    assert.throws(() => readJsonSafe(path.join(tmpDir, 'missing.json')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
