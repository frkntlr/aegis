import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DoctoolRunner } from './classdboracle/doctool-runner.js';

test('DoctoolRunner parses raw JSON extension API into indexed ClassInfo map', () => {
  const runner = new DoctoolRunner();
  const mockDump = {
    classes: [
      {
        name: 'MockPlayer',
        inherits: 'CharacterBody2D',
        methods: [
          {
            name: 'jump',
            return_value: { type: 'void' },
            arguments: [{ name: 'force', type: 'float' }]
          }
        ],
        properties: [
          { name: 'health', type: 'int', setter: 'set_health', getter: 'get_health' }
        ],
        signals: [
          { name: 'died', arguments: [] }
        ]
      }
    ]
  };

  const parsed = runner.parseRawApi(mockDump);
  assert.strictEqual(parsed.size, 1);
  const player = parsed.get('MockPlayer');
  assert.ok(player);
  assert.strictEqual(player.inherits, 'CharacterBody2D');
  assert.strictEqual(player.methods.length, 1);
  assert.strictEqual(player.methods[0].name, 'jump');
  assert.strictEqual(player.methods[0].arguments[0].name, 'force');
  assert.strictEqual(player.properties[0].name, 'health');
  assert.strictEqual(player.signals[0].name, 'died');
});

test('DoctoolRunner gracefully handles missing or invalid binary', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-doctool-test-'));
  try {
    const runner = new DoctoolRunner({
      godotBinary: path.join(tmp, 'nonexistent_godot.exe'),
      cacheDir: tmp
    });
    const map = runner.dumpAndIndexApi();
    assert.strictEqual(map.size, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
