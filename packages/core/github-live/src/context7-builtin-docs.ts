/**
 * @file context7-builtin-docs.ts
 * Builtin ground-truth documentation catalog for Context7Bridge.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { Context7DocEntry } from './context7-bridge.js';

export class Context7BuiltinDocs {
  public static getBuiltinDocs(): Context7DocEntry[] {
    return [
      ...Context7BuiltinDocs.getGodotDocs(),
      ...Context7BuiltinDocs.getGeneralDocs(),
      ...Context7BuiltinDocs.getPolyglotDocs()
    ];
  }

  private static getGodotDocs(): Context7DocEntry[] {
    return [
      ...Context7BuiltinDocs.getGodotCoreDocs(),
      ...Context7BuiltinDocs.getGodotFeatureDocs()
    ];
  }

  private static getGodotCoreDocs(): Context7DocEntry[] {
    return [
      {
        library: 'godot4',
        topic: 'lifecycle',
        version: '4.3',
        summary: 'Godot 4 Node lifecycle and instantiation conventions.',
        signatures: [
          'PackedScene.instantiate() -> Node',
          'Node.queue_free() -> void',
          'Node.is_queued_for_deletion() -> bool'
        ],
        codeExample: 'var inst = scene.instantiate()\nadd_child(inst)',
        breakingChanges: [
          'scene.instance() is deprecated in Godot 4; use scene.instantiate().',
          'Do not use is_instance_valid() as a band-aid; use tree exit hooks or signals.'
        ]
      },
      {
        library: 'godot4',
        topic: 'signals',
        version: '4.3',
        summary: 'Godot 4 first-class signal and Callable connections.',
        signatures: ['signal_name.emit(...args)', 'signal_name.connect(callable: Callable)'],
        codeExample: 'health_changed.emit(hp, max_hp)\nbutton.pressed.connect(_on_pressed)',
        breakingChanges: ['connect("pressed", self, "_on_pressed") is replaced by button.pressed.connect(_on_pressed).']
      }
    ];
  }

  private static getGodotFeatureDocs(): Context7DocEntry[] {
    return [
      {
        library: 'godot4',
        topic: 'physics',
        version: '4.3',
        summary: 'Godot 4 CharacterBody2D and kinematics standard.',
        signatures: ['velocity: Vector2', 'move_and_slide() -> bool'],
        codeExample: 'velocity = direction * SPEED\nmove_and_slide()',
        breakingChanges: ['move_and_slide() takes 0 arguments in Godot 4; set self.velocity before calling.']
      },
      {
        library: 'godot4',
        topic: 'ui',
        version: '4.3',
        summary: 'Godot 4 UI Controls, Containers and Touch Target specifications.',
        signatures: ['custom_minimum_size: Vector2', 'anchors_preset: int'],
        codeExample: 'custom_minimum_size = Vector2(48, 48)',
        breakingChanges: ['Interactive touch elements require at least 48x48px touch targets.']
      }
    ];
  }

  private static getGeneralDocs(): Context7DocEntry[] {
    return [
      {
        library: 'typescript',
        topic: 'node-test',
        version: '5.5',
        summary: 'Node.js built-in test runner with strict assertions.',
        signatures: ['test(name: string, fn: () => void | Promise<void>)', 'assert.strictEqual(actual, expected)', 'assert.ok(value)'],
        codeExample: 'import { test } from "node:test";\nimport * as assert from "node:assert";'
      },
      {
        library: 'typescript',
        topic: 'clean-arch',
        version: '5.5',
        summary: 'TypeScript Clean Domain Architecture & Demir Kafes compliance.',
        signatures: ['TS_001_NO_ANY', 'TS_002_EMPTY_CATCH', 'TS_003_NESTING_DEPTH'],
        codeExample: 'try { doTask(); } catch (err) { logger.error(err); }',
        breakingChanges: ['No explicit any. No uncommented swallowed catches. Max nesting depth <= 4.']
      },
      {
        library: 'aegis',
        topic: 'constitution',
        version: '1.0',
        summary: 'Demir Kafes architectural constraints and multi-agent worktree protocols.',
        signatures: ['Max 300 lines per file', 'Max 40 lines per function', 'Surgical Unified Diffs only']
      }
    ];
  }

  private static getPolyglotDocs(): Context7DocEntry[] {
    return [
      {
        library: 'python',
        topic: 'typing',
        version: '3.12',
        summary: 'Python typing conventions and PEP 8 standards.',
        signatures: ['def fn(x: int) -> str:', 'Optional[T] | None', 'class Model(BaseModel):'],
        codeExample: 'def greet(name: str) -> str:\n    return f"Hello {name}"',
        breakingChanges: ['Use Type | None instead of Optional[Type] in Python 3.10+.']
      },
      {
        library: 'rust',
        topic: 'error-handling',
        version: '1.78',
        summary: 'Rust Result and Option idiomatic error handling standards.',
        signatures: ['Result<T, E>', 'Option<T>', 'fn run() -> Result<(), Box<dyn Error>>'],
        codeExample: 'let val = opt.ok_or_else(|| "error")?;',
        breakingChanges: ['Never use unwrap() or expect() in production library code.']
      },
      {
        library: 'go',
        topic: 'idioms',
        version: '1.22',
        summary: 'Go error handling and goroutine concurrency standards.',
        signatures: ['if err != nil { return err }', 'context.Context', 'sync.WaitGroup'],
        codeExample: 'if err != nil {\n    return fmt.Errorf("failed: %w", err)\n}',
        breakingChanges: ['Always propagate errors with %w for wrapping.']
      }
    ];
  }
}
