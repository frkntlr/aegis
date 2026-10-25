import type { Context7DocEntry } from './context7-bridge.js';

export class Context7Registry {
  public static registerAll(register: (doc: Context7DocEntry) => void): void {
    this.registerNodeDocs(register);
    this.registerGodotDocs(register);
    this.registerTestDocs(register);
    this.registerPolyglotDocs(register);
  }

  private static registerNodeDocs(reg: (doc: Context7DocEntry) => void): void {
    reg({
      library: 'node',
      topic: 'fs/promises',
      version: '20.x/22.x',
      summary: 'Node.js modern async file system operations via node:fs/promises.',
      signatures: [
        'readFile(path, { encoding: "utf8" }): Promise<string>',
        'writeFile(path, data, "utf8"): Promise<void>',
        'mkdir(path, { recursive: true }): Promise<string | undefined>',
        'stat(path): Promise<Stats>'
      ],
      codeExample: 'import { readFile, writeFile } from "node:fs/promises";\nconst data = await readFile("file.txt", "utf8");',
      breakingChanges: ['Never use fs.promises.exists(); use await stat(p).then(() => true).catch(() => false).']
    });

    reg({
      library: 'node',
      topic: 'path',
      version: '20.x/22.x',
      summary: 'Node.js path resolution and cross-platform normalization via node:path.',
      signatures: ['resolve(...paths): string', 'join(...paths): string', 'dirname(p): string', 'posix.normalize(p): string'],
      codeExample: 'import * as path from "node:path";\nconst target = path.resolve(process.cwd(), "file.txt");'
    });
  }

  private static registerGodotDocs(reg: (doc: Context7DocEntry) => void): void {
    reg({
      library: 'godot4',
      topic: 'tween',
      version: '4.3',
      summary: 'Godot 4.3 SceneTreeTween animation system.',
      signatures: [
        'create_tween() -> Tween',
        'tween_property(target, property, final_val, duration) -> PropertyTweener',
        'tween_callback(callable) -> CallbackTweener'
      ],
      codeExample: 'var tween = create_tween()\ntween.tween_property($Sprite2D, "modulate:a", 0.0, 0.5)',
      breakingChanges: ['Tween node and interpolate_property() are obsolete in Godot 4; use create_tween().']
    });

    reg({
      library: 'godot4',
      topic: 'movement',
      version: '4.3',
      summary: 'Godot 4 CharacterBody2D/3D velocity and movement standards.',
      signatures: ['move_and_slide() -> bool', 'velocity: Vector2 / Vector3', 'is_on_floor() -> bool'],
      codeExample: 'velocity.y += gravity * delta\nmove_and_slide()',
      breakingChanges: ['move_and_slide() no longer takes velocity argument; mutate velocity property in-place.']
    });
  }

  private static registerTestDocs(reg: (doc: Context7DocEntry) => void): void {
    reg({
      library: 'vitest',
      topic: 'assertions',
      version: '1.x/2.x',
      summary: 'Vitest modern assertions and test lifecycle.',
      signatures: ['expect(val).toBe(expected)', 'expect(fn).toHaveBeenCalledWith(...)', 'vi.fn()', 'vi.spyOn(obj, method)'],
      codeExample: 'import { test, expect, vi } from "vitest";\ntest("mock", () => { const f = vi.fn(); f(); expect(f).toHaveBeenCalled(); });'
    });

    reg({
      library: 'typescript',
      topic: 'satisfies',
      version: '5.x',
      summary: 'TypeScript satisfies operator for safe type validation without widening.',
      signatures: ['const x = { ... } satisfies Type;'],
      codeExample: 'type Config = { port: number; host?: string };\nconst c = { port: 3000 } satisfies Config;',
      breakingChanges: ['Prefer satisfies over "as Type" to prevent unsafe type assertions.']
    });
  }

  private static registerPolyglotDocs(reg: (doc: Context7DocEntry) => void): void {
    reg({
      library: 'python',
      topic: 'typing-312',
      version: '3.12',
      summary: 'Python 3.12 modern typing with TypeVarTuple, Self, and built-in generics.',
      signatures: ['from typing import Self, TypedDict', 'type Coordinate = tuple[float, float]'],
      codeExample: 'class Builder:\n    def set_name(self, name: str) -> Self:\n        self.name = name\n        return self',
      breakingChanges: ['Do not import typing.List, typing.Dict; use lowercase list, dict.']
    });

    reg({
      library: 'rust',
      topic: 'tokio',
      version: '1.x',
      summary: 'Rust Tokio async runtime, tasks and channels.',
      signatures: ['tokio::spawn(async move { ... })', 'tokio::time::sleep(duration).await', 'tokio::sync::mpsc::channel(buffer)'],
      codeExample: 'tokio::spawn(async move {\n    process_stream().await;\n});',
      breakingChanges: ['Never call std::thread::sleep or blocking std::sync::Mutex in async tasks.']
    });
  }
}
