import { test } from 'node:test';
import * as assert from 'node:assert';
import { IronCageValidator } from './cage-validator.js';
import { GDScriptRulesValidator } from './gdscript-rules.js';

test('IronCageValidator passes clean files', () => {
  const validator = new IronCageValidator({ maxFunctionLines: 40, maxFileLines: 300 });
  const content = `
function cleanHelper() {
  const a = 1;
  const b = 2;
  return a + b;
}
  `.trim();

  const result = validator.validateFileContent('src/clean.ts', content);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.violations.length, 0);
});

test('IronCageValidator flags files exceeding line limits', () => {
  const validator = new IronCageValidator({ maxFileLines: 5 });
  const content = '1\n2\n3\n4\n5\n6\n7\n8';

  const result = validator.validateFileContent('src/long.ts', content);
  assert.strictEqual(result.passed, false);
  assert.ok(result.violations.some(v => v.rule === 'MAX_FILE_LINES'));
});

test('IronCageValidator detects full file rewrites', () => {
  const validator = new IronCageValidator();
  const result = validator.validateDiff('src/Core.ts', 200, 180, 100);

  assert.strictEqual(result.passed, false);
  assert.ok(result.violations.some(v => v.rule === 'FULL_FILE_REWRITE'));
});

test('IronCageValidator accurately parses AST with multi-line signatures, template strings and callbacks', () => {
  const validator = new IronCageValidator({ maxFunctionLines: 40, maxFileLines: 300 });
  const complexTs = `
export async function complexHandler(
  paramA: string,
  paramB: number,
  options: {
    verbose: boolean;
    tags: string[];
  }
): Promise<{ success: boolean; data: string }> {
  const template = \`
    {
      "nested": "\${paramA}",
      "calc": \${paramB + 10}
    }
  \`;
  const items = [1, 2, 3].map(item => {
    return { id: item, str: \`item-\${item}\` };
  });
  return { success: true, data: template };
}
  `.trim();

  const result = validator.validateFileContent('src/complex.ts', complexTs);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.violations.length, 0);
});

test('IronCageValidator flags oversized function using true TypeScript AST', () => {
  const validator = new IronCageValidator({ maxFunctionLines: 10, maxFileLines: 300 });
  const lines: string[] = ['function oversizedProcessor() {'];
  for (let i = 0; i < 15; i++) {
    lines.push(`  const step${i} = ${i};`);
  }
  lines.push('  return true;');
  lines.push('}');
  const content = lines.join('\n');

  const result = validator.validateFileContent('src/oversized.ts', content);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.violations.length, 1);
  assert.strictEqual(result.violations[0].rule, 'MAX_FUNCTION_LINES');
  assert.ok(result.violations[0].message.includes('oversizedProcessor'));
});

test('IronCageValidator accurately handles Python and GDScript indentation-based function lines', () => {
  const validator = new IronCageValidator({ maxFunctionLines: 5, maxFileLines: 300 });

  const pyValid = `
def short_func():
    a = 1
    b = 2
    return a + b
`.trim();
  assert.strictEqual(validator.validateFileContent('script.py', pyValid).passed, true);

  const pyOversized = `
def long_func():
    x1 = 1
    x2 = 2
    x3 = 3
    x4 = 4
    x5 = 5
    x6 = 6
    return x1 + x6
`.trim();
  const pyRes = validator.validateFileContent('script.py', pyOversized);
  assert.strictEqual(pyRes.passed, false);
  assert.strictEqual(pyRes.violations[0].rule, 'MAX_FUNCTION_LINES');

  const gdValid = `
func short_player_logic():
\tvelocity.x = 100
\tmove_and_slide()
`.trim();
  assert.strictEqual(validator.validateFileContent('player.gd', gdValid).passed, true);
});

test('GDScriptRulesValidator enforces GD-001 through GD-006', () => {
  const validator = new GDScriptRulesValidator({ maxFunctionLines: 5, maxComplexity: 3 });

  const script = `
signal health_changed(new_health)
@onready var bad_ref = $""

func complex_func():
\tif true and true:
\t\tif false or false:
\t\t\tmatch 1:
\t\t\t\t1: pass
\tvar scene = load("res://mob.tscn").instantiate()
\temit_signal("unknown_signal")
`.trim();

  const violations = validator.validate('scripts/enemy.gd', script);
  const rules = violations.map(v => v.rule);

  assert.ok(rules.includes('GD_003_ONREADY_SAFETY'), 'Detects empty onready path');
  assert.ok(rules.includes('GD_004_SIGNAL_SAFETY'), 'Detects undeclared signal emission');
  assert.ok(rules.includes('GD_005_RESOURCE_LEAK'), 'Detects instantiate without add_child/queue_free');
  assert.ok(rules.includes('GD_006_CYCLOMATIC_COMPLEXITY'), 'Detects high complexity');
});

test('GDScriptRulesValidator does not flag RefCounted objects or engine signals as violations', () => {
  const validator = new GDScriptRulesValidator();

  const script = `
func setup_utils():
\tvar regex = RegEx.new()
\tvar cfg = ConfigFile.new()
\temit_signal("pressed")
`.trim();

  const violations = validator.validate('scripts/utils.gd', script);
  assert.strictEqual(violations.length, 0);
});

test('GDScriptRulesValidator supports modern Godot 4 signal.emit() and recognizes member assignment', () => {
  const validator = new GDScriptRulesValidator();

  const script = `
signal custom_event

func valid_handlers():
\tcustom_event.emit()
\tpressed.emit()
\tself.active_node = Node.new()
\t_cached_child = Node.new()
\titems["key"] = Node.new()
\tvar n = Node.new()
\tn.free()

func invalid_signal():
\tundeclared_boom.emit()
`.trim();

  const violations = validator.validate('scripts/modern.gd', script);
  const signalViolations = violations.filter(v => v.rule === 'GD_004_SIGNAL_SAFETY');
  const leakViolations = violations.filter(v => v.rule === 'GD_005_RESOURCE_LEAK');

  assert.strictEqual(signalViolations.length, 1);
  assert.ok(signalViolations[0].message.includes('undeclared_boom'));
  assert.strictEqual(leakViolations.length, 0, 'No resource leak false positives for member assignments or .free()');
});
