import { test } from 'node:test';
import * as assert from 'node:assert';
import { TypeScriptSkeletonExtractor } from './ts-extractor.js';
import { PythonSkeletonExtractor } from './python-extractor.js';
import { GDScriptSkeletonExtractor } from './gdscript-extractor.js';
import { SkeletonGenerator } from './skeleton-generator.js';
import { PromptCacheManager } from './cache-manager.js';
import { DiffEngine } from './diff-engine.js';

test('TypeScriptSkeletonExtractor omits function bodies and preserves types/classes', () => {
  const extractor = new TypeScriptSkeletonExtractor();
  const sample = `
import { Config } from './config';

export interface User {
  id: string;
  name: string;
}

export type Role = 'admin' | 'user';

export class UserService {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
    console.log('Heavy initialization', this.secret);
  }

  public async getUser(id: string): Promise<User> {
    const db = await connect();
    const row = await db.query('SELECT * FROM users WHERE id = ?', id);
    return row;
  }
}

export function calculateMetrics(input: number[]): number {
  let sum = 0;
  for (const n of input) {
    sum += n * 2;
  }
  return sum;
}
  `.trim();

  const result = extractor.extract('service.ts', sample);
  assert.ok(!result.skeletonContent.includes('Heavy initialization'));
  assert.ok(!result.skeletonContent.includes('SELECT * FROM users'));
  assert.ok(!result.skeletonContent.includes('sum += n * 2'));

  assert.ok(result.skeletonContent.includes('export interface User'));
  assert.ok(result.skeletonContent.includes('export type Role'));
  assert.ok(result.skeletonContent.includes('class UserService'));
  assert.ok(result.skeletonContent.includes('getUser(id: string): Promise<User>'));
  assert.ok(result.skeletonContent.includes('function calculateMetrics(input: number[]): number'));
  assert.ok(result.tokenSavingsPercent >= 30, `Expected savings >= 30%, got ${result.tokenSavingsPercent}%`);
});

test('PythonSkeletonExtractor preserves signatures, decorators, and replaces bodies with ellipsis', () => {
  const extractor = new PythonSkeletonExtractor();
  const sample = `
import os
from typing import List, Optional, Dict
from dataclasses import dataclass

MAX_CONNECTIONS: int = 100
DEFAULT_TIMEOUT = 30.0

@dataclass
class AgentConfig:
    name: str
    max_retries: int = 3

    @property
    def is_valid(self) -> bool:
        if not self.name:
            return False
        return self.max_retries > 0

    async def execute_task(self, task_id: str, timeout: Optional[float] = None) -> Dict[str, str]:
        print("Starting task execution with 100 lines of complex logic...")
        res = await network_call(task_id)
        for i in range(100):
            res = transform(res)
        return {"status": "ok", "id": task_id}

@app.get("/health")
def health_check() -> dict:
    # Health check implementation
    db_ok = check_db()
    cache_ok = check_cache()
    return {"status": "healthy" if db_ok and cache_ok else "unhealthy"}
  `.trim();

  const result = extractor.extract('agent.py', sample);

  // Signatures, types, decorators, constants preserved
  assert.ok(result.skeletonContent.includes('import os'));
  assert.ok(result.skeletonContent.includes('from typing import List, Optional, Dict'));
  assert.ok(result.skeletonContent.includes('MAX_CONNECTIONS: int = 100'));
  assert.ok(result.skeletonContent.includes('@dataclass'));
  assert.ok(result.skeletonContent.includes('class AgentConfig:'));
  assert.ok(result.skeletonContent.includes('@property'));
  assert.ok(result.skeletonContent.includes('def is_valid(self) -> bool:'));
  assert.ok(result.skeletonContent.includes('async def execute_task(self, task_id: str, timeout: Optional[float] = None) -> Dict[str, str]:'));
  assert.ok(result.skeletonContent.includes('@app.get("/health")'));
  assert.ok(result.skeletonContent.includes('def health_check() -> dict:'));

  // Function bodies omitted
  assert.ok(!result.skeletonContent.includes('Starting task execution with 100 lines'));
  assert.ok(!result.skeletonContent.includes('check_db()'));
  assert.ok(!result.skeletonContent.includes('for i in range(100)'));
  assert.ok(result.skeletonContent.includes('...'));

  assert.ok(result.tokenSavingsPercent >= 40, `Expected Python savings >= 40%, got ${result.tokenSavingsPercent}%`);
});

test('GDScriptSkeletonExtractor preserves Godot annotations, signals, enums, and replaces bodies with pass', () => {
  const extractor = new GDScriptSkeletonExtractor();
  const sample = `
extends CharacterBody2D
class_name PlayerController

signal health_depleted
signal scored(points: int)

enum MovementState {
    IDLE,
    WALKING,
    RUNNING,
    JUMPING
}

const GRAVITY: float = 980.0
const JUMP_VELOCITY: float = -400.0

@export var max_health: int = 100
@export_range(100.0, 600.0) var movement_speed: float = 300.0
@onready var sprite: Sprite2D = $Sprite2D
@onready var collision_shape: CollisionShape2D = $CollisionShape2D

var current_state: MovementState = MovementState.IDLE
var current_health: int = 100

func _ready() -> void:
    current_health = max_health
    sprite.play("idle")
    print("Player initialized with health: ", current_health)

func _physics_process(delta: float) -> void:
    if not is_on_floor():
        velocity.y += GRAVITY * delta
    var direction = Input.get_axis("ui_left", "ui_right")
    if direction:
        velocity.x = direction * movement_speed
    else:
        velocity.x = move_toward(velocity.x, 0, movement_speed)
    move_and_slide()

static func calculate_fall_damage(fall_height: float) -> int:
    if fall_height < 50.0:
        return 0
    return int(fall_height * 0.5)
  `.trim();

  const result = extractor.extract('player_controller.gd', sample);

  // GDScript essentials preserved
  assert.ok(result.skeletonContent.includes('extends CharacterBody2D'));
  assert.ok(result.skeletonContent.includes('class_name PlayerController'));
  assert.ok(result.skeletonContent.includes('signal health_depleted'));
  assert.ok(result.skeletonContent.includes('signal scored(points: int)'));
  assert.ok(result.skeletonContent.includes('const GRAVITY: float = 980.0'));
  assert.ok(result.skeletonContent.includes('@export var max_health: int = 100'));
  assert.ok(result.skeletonContent.includes('@export_range(100.0, 600.0) var movement_speed: float = 300.0'));
  assert.ok(result.skeletonContent.includes('@onready var sprite: Sprite2D = $Sprite2D'));
  assert.ok(result.skeletonContent.includes('func _ready() -> void:'));
  assert.ok(result.skeletonContent.includes('func _physics_process(delta: float) -> void:'));
  assert.ok(result.skeletonContent.includes('static func calculate_fall_damage(fall_height: float) -> int:'));

  // Function bodies omitted and replaced with pass
  assert.ok(!result.skeletonContent.includes('sprite.play("idle")'));
  assert.ok(!result.skeletonContent.includes('move_toward(velocity.x, 0, movement_speed)'));
  assert.ok(!result.skeletonContent.includes('move_and_slide()'));
  assert.ok(result.skeletonContent.includes('pass'));

  assert.ok(result.tokenSavingsPercent >= 40, `Expected GDScript savings >= 40%, got ${result.tokenSavingsPercent}%`);
});

test('SkeletonGenerator routes TS, Python, and GDScript files accurately', () => {
  const generator = new SkeletonGenerator();
  const tsRes = generator.extractFile('app.ts', 'export function run(): void { console.log(123); }');
  const pyRes = generator.extractFile('main.py', 'def run():\n    print(123)\n');
  const gdRes = generator.extractFile('actor.gd', 'func run() -> void:\n    print(123)\n');

  assert.ok(tsRes.skeletonContent.includes('function run(): void;'));
  assert.ok(pyRes.skeletonContent.includes('...'));
  assert.ok(gdRes.skeletonContent.includes('pass'));
});

test('PromptCacheManager splits context into cached blocks', () => {
  const manager = new PromptCacheManager('Test Constitution');
  const context = manager.assembleContext('class A { foo(): void; }', 'Fix bug in foo');

  assert.strictEqual(context.constitutionBlock.cache_control?.type, 'ephemeral');
  assert.strictEqual(context.skeletonMapBlock.cache_control?.type, 'ephemeral');
  assert.strictEqual(context.taskBlock.cache_control, undefined);
  assert.ok(context.cacheRatioPercent > 0);
});

test('DiffEngine validates surgical unified diffs and rejects massive changes', () => {
  const engine = new DiffEngine();
  const validDiff = `
--- a/src/service.ts
+++ b/src/service.ts
@@ -10,3 +10,4 @@
   const a = 1;
+  const b = 2;
   return a;
  `.trim();

  const parsed = engine.parseAndValidate(validDiff, 100);
  assert.strictEqual(parsed.isSurgical, true);
  assert.strictEqual(parsed.addedLinesCount, 1);
  assert.strictEqual(parsed.oldFile, 'src/service.ts');

  // Test rejection of massive diff
  const parsedOversized = engine.parseAndValidate(validDiff, 0); // max 0 allowed
  assert.strictEqual(parsedOversized.isSurgical, false);
  assert.ok(parsedOversized.rejectionReason?.includes('exceeding surgical limit'));
});
