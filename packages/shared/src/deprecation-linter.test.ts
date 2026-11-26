import test from 'node:test';
import * as assert from 'node:assert/strict';
import { DeprecationLinter } from './deprecation-linter.js';

test('DeprecationLinter.lintGodot flags Godot 3 breaking patterns and skips comments', () => {
  const code = [
    '# scene.instance() in comment should be ignored',
    'var node = scene.instance()',
    'move_and_slide(vel)',
    'btn.connect("pressed", self, "_on_go")',
    'yield(get_tree(), "idle_frame")'
  ].join('\n');
  const warnings = DeprecationLinter.lintGodot(code);
  assert.deepEqual(
    warnings.map((w) => ({ code: w.code, line: w.line })),
    [
      { code: 'GD_DEP_001', line: 2 },
      { code: 'GD_DEP_002', line: 3 },
      { code: 'GD_DEP_003', line: 4 },
      { code: 'GD_DEP_004', line: 5 }
    ]
  );
});

test('DeprecationLinter.lintTypeScript flags explicit any and empty catch, skipping comments', () => {
  const code = [
    '// const ignored: any = 1;',
    'const x: any = 1;',
    'try { run(); } catch {}'
  ].join('\n');
  const warnings = DeprecationLinter.lintTypeScript(code);
  assert.deepEqual(
    warnings.map((w) => ({ code: w.code, line: w.line })),
    [
      { code: 'TS_DEP_001', line: 2 },
      { code: 'TS_DEP_002', line: 3 }
    ]
  );
});

test('DeprecationLinter.lint dispatches by ecosystem or runs both', () => {
  const mixed = 'var a = scene.instance()\nconst b: any = 1;\n';
  assert.equal(DeprecationLinter.lint(mixed, 'godot').length, 1);
  assert.equal(DeprecationLinter.lint(mixed, 'typescript').length, 1);
  assert.equal(DeprecationLinter.lint(mixed).length, 2);
});
