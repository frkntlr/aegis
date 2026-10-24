import { test } from 'node:test';
import * as assert from 'node:assert';
import { TypeScriptSkeletonExtractor } from './ts-extractor.js';
import { PythonSkeletonExtractor } from './python-extractor.js';
import { GDScriptSkeletonExtractor } from './gdscript-extractor.js';
import { RustSkeletonExtractor } from './rust-extractor.js';
import { ExtractorRegistry, type LanguageExtractor } from './extractor-registry.js';
import { SkeletonGenerator } from './skeleton-generator.js';
import { PromptCacheManager } from './cache-manager.js';
import { DiffEngine } from './diff-engine.js';

const tsFixture = [
  "import { Config } from './config';",
  "export interface User { id: string; name: string; }",
  "export type Role = 'admin' | 'user';",
  "export class UserService {",
  "  private secret: string;",
  "  constructor(secret: string) { this.secret = secret; console.log('Heavy initialization', this.secret); }",
  "  public async getUser(id: string): Promise<User> { const row = await query('SELECT * FROM users'); return row; }",
  "}",
  "export function calculateMetrics(input: number[]): number { let sum = 0; for (const n of input) { sum += n * 2; } return sum; }"
].join('\n');

test('TypeScriptSkeletonExtractor omits function bodies and preserves types/classes', () => {
  const extractor = new TypeScriptSkeletonExtractor();
  const res = extractor.extract('service.ts', tsFixture);
  assert.ok(!res.skeletonContent.includes('Heavy initialization'));
  assert.ok(!res.skeletonContent.includes('SELECT * FROM users'));
  assert.ok(!res.skeletonContent.includes('sum += n * 2'));
  assert.ok(res.skeletonContent.includes('export interface User'));
  assert.ok(res.skeletonContent.includes('export type Role'));
  assert.ok(res.skeletonContent.includes('class UserService'));
  assert.ok(res.skeletonContent.includes('getUser(id: string): Promise<User>'));
  assert.ok(res.skeletonContent.includes('function calculateMetrics(input: number[]): number'));
  assert.ok(res.tokenSavingsPercent >= 30);
});

const pyFixture = [
  "import os",
  "from typing import List, Optional, Dict",
  "from dataclasses import dataclass",
  "MAX_CONNECTIONS: int = 100",
  "DEFAULT_TIMEOUT = 30.0",
  "@dataclass",
  "class AgentConfig:",
  "    name: str",
  "    max_retries: int = 3",
  "    @property",
  "    def is_valid(self) -> bool:",
  "        return self.max_retries > 0",
  "    async def execute_task(self, task_id: str, timeout: Optional[float] = None) -> Dict[str, str]:",
  "        print('Starting task execution with 100 lines of complex logic...')",
  "        res = await network_call(task_id)",
  "        for i in range(100): res = transform(res)",
  "        return {'status': 'ok', 'id': task_id}",
  "@app.get('/health')",
  "def health_check() -> dict:",
  "    db_ok = check_db()",
  "    cache_ok = check_cache()",
  "    return {'status': 'healthy' if db_ok and cache_ok else 'unhealthy'}"
].join('\n');

test('PythonSkeletonExtractor preserves signatures, decorators, and replaces bodies with ellipsis', () => {
  const extractor = new PythonSkeletonExtractor();
  const res = extractor.extract('agent.py', pyFixture);
  assert.ok(res.skeletonContent.includes('class AgentConfig:'));
  assert.ok(res.skeletonContent.includes('@dataclass'));
  assert.ok(res.skeletonContent.includes('@property'));
  assert.ok(res.skeletonContent.includes('def is_valid(self) -> bool:'));
  assert.ok(res.skeletonContent.includes('async def execute_task(self, task_id: str, timeout: Optional[float] = None) -> Dict[str, str]:'));
  assert.ok(!res.skeletonContent.includes('Starting task execution'));
  assert.ok(!res.skeletonContent.includes('res = await network_call'));
  assert.ok(res.skeletonContent.includes('...'));
  assert.ok(res.tokenSavingsPercent >= 30);
});

const gdFixture = [
  "extends CharacterBody2D",
  "class_name PlayerController",
  "signal health_changed(new_health: int)",
  "enum State { IDLE, RUN, JUMP }",
  "@export var speed: float = 300.0",
  "var gravity: float = 980.0",
  "func _ready() -> void:",
  "    print('Ready called')",
  "func _physics_process(delta: float) -> void:",
  "    velocity.y += gravity * delta",
  "    move_and_slide()",
  "static func calculate_fall_damage(fall_height: float) -> int:",
  "    if fall_height > 10.0: return int(fall_height * 2.0)",
  "    return 0"
].join('\n');

test('GDScriptSkeletonExtractor preserves Godot annotations, signals, enums, and replaces bodies with pass', () => {
  const extractor = new GDScriptSkeletonExtractor();
  const res = extractor.extract('player.gd', gdFixture);
  assert.ok(res.skeletonContent.includes('extends CharacterBody2D'));
  assert.ok(res.skeletonContent.includes('class_name PlayerController'));
  assert.ok(res.skeletonContent.includes('signal health_changed(new_health: int)'));
  assert.ok(res.skeletonContent.includes('enum State { IDLE, RUN, JUMP }'));
  assert.ok(res.skeletonContent.includes('@export var speed: float = 300.0'));
  assert.ok(res.skeletonContent.includes('func _ready() -> void:'));
  assert.ok(res.skeletonContent.includes('func _physics_process(delta: float) -> void:'));
  assert.ok(res.skeletonContent.includes('static func calculate_fall_damage(fall_height: float) -> int:'));
  assert.ok(!res.skeletonContent.includes('Ready called'));
  assert.ok(res.skeletonContent.includes('pass'));
  assert.ok(res.tokenSavingsPercent >= 25);
});

const rustFixture = [
  "use std::collections::HashMap;",
  "pub struct EngineConfig { pub threads: usize }",
  "impl EngineConfig {",
  "    pub fn new(threads: usize) -> Self {",
  "        println!(\"Allocating heavy buffer with {} threads\", threads);",
  "        Self { threads }",
  "    }",
  "}",
  "pub async fn compute_hash(input: &str) -> String {",
  "    let heavy = input.repeat(100);",
  "    heavy",
  "}"
].join('\n');

test('RustSkeletonExtractor omits function bodies and preserves struct/impl/traits', () => {
  const extractor = new RustSkeletonExtractor();
  const res = extractor.extract('engine.rs', rustFixture);
  assert.ok(res.skeletonContent.includes('pub struct EngineConfig'));
  assert.ok(res.skeletonContent.includes('pub fn new(threads: usize) -> Self { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('pub async fn compute_hash(input: &str) -> String { /* body omitted */ }'));
  assert.ok(!res.skeletonContent.includes('Allocating heavy buffer'));
  assert.ok(!res.skeletonContent.includes('input.repeat(100)'));
  assert.ok(res.tokenSavingsPercent >= 20);
});

test('ExtractorRegistry registers community language extractors and integrates with SkeletonGenerator', () => {
  const registry = new ExtractorRegistry();
  const mockKotlin: LanguageExtractor = {
    languageId: 'kotlin',
    supportedExtensions: ['.kt'],
    extract: (_rel, content) => ({
      originalLength: content.length,
      skeletonLength: 30,
      tokenSavingsPercent: 70,
      skeletonContent: '// Kotlin Skeleton'
    })
  };
  registry.register(mockKotlin);

  assert.strictEqual(registry.listLanguages().includes('kotlin'), true);
  assert.strictEqual(registry.getExtractor('Model.kt'), mockKotlin);

  const generator = new SkeletonGenerator(registry);
  const result = generator.extractFile('Model.kt', 'class Model(val name: String) { fun compute() {} }');
  assert.strictEqual(result.skeletonContent, '// Kotlin Skeleton');
  assert.strictEqual(result.tokenSavingsPercent, 70);
});

test('SkeletonGenerator routes TS, Python, GDScript, and Rust files accurately', () => {
  const generator = new SkeletonGenerator();
  const tsRes = generator.extractFile('app.ts', 'export function run(): void { console.log(123); }');
  const pyRes = generator.extractFile('main.py', 'def run():\n    print(123)\n');
  const gdRes = generator.extractFile('actor.gd', 'func run() -> void:\n    print(123)\n');
  const rsRes = generator.extractFile('lib.rs', 'pub fn run() -> i32 { 42 }\n');

  assert.ok(tsRes.skeletonContent.includes('function run(): void;'));
  assert.ok(pyRes.skeletonContent.includes('...'));
  assert.ok(gdRes.skeletonContent.includes('pass'));
  assert.ok(rsRes.skeletonContent.includes('{ /* body omitted */ }'));
});

test('PromptCacheManager splits context into cached blocks', () => {
  const mgr = new PromptCacheManager();
  const context = mgr.assembleContext('export class API {}', 'Fix issue #1');
  assert.ok(context.constitutionBlock.cache_control);
  assert.ok(context.skeletonMapBlock.cache_control);
  assert.strictEqual(context.taskBlock.cache_control, undefined);
  assert.ok(context.cacheRatioPercent > 0);
});

test('DiffEngine validates surgical unified diffs and rejects massive changes', () => {
  const engine = new DiffEngine();
  const validDiff = `--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,4 @@\n import { test } from 'node:test';\n+import { extra } from 'node:assert';\n console.log(1);`;
  const res = engine.parseAndValidate(validDiff, 10);
  assert.strictEqual(res.isSurgical, true);
  assert.strictEqual(res.addedLinesCount, 1);

  const massiveDiff = `--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,20 @@\n` + Array.from({ length: 25 }, (_, i) => `+line ${i}`).join('\n');
  const rejected = engine.parseAndValidate(massiveDiff, 10);
  assert.strictEqual(rejected.isSurgical, false);
  assert.ok(rejected.rejectionReason?.includes('exceeding surgical limit'));
});

test('DiffEngine accepts hunk headers with trailing function context', () => {
  const engine = new DiffEngine();
  const diffWithContext = `--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1,5 +1,6 @@ function testFunc() {\n const x = 1;\n+const y = 2;\n return x;`;
  const res = engine.parseAndValidate(diffWithContext, 10);
  assert.strictEqual(res.isSurgical, true);
  assert.strictEqual(res.chunks.length, 1);
  assert.strictEqual(res.chunks[0].oldStart, 1);
  assert.strictEqual(res.chunks[0].newStart, 1);
});

test('PythonSkeletonExtractor ignores indented assignments and equality comparisons', () => {
  const extractor = new PythonSkeletonExtractor();
  const pyCode = [
    'GLOBAL_VAR = "hello"',
    'def calculate(val):',
    '    x = val * 2',
    '    if x == 10:',
    '        return True',
    '    return False'
  ].join('\n');

  const res = extractor.extract('test.py', pyCode);
  assert.ok(res.skeletonContent.includes('GLOBAL_VAR = "hello"'));
  assert.ok(res.skeletonContent.includes('def calculate(val):'));
  assert.ok(!res.skeletonContent.includes('x = val * 2'));
  assert.ok(!res.skeletonContent.includes('if x == 10:'));
});

test('DiffEngine correctly handles Windows CRLF diffs with empty context lines', () => {
  const engine = new DiffEngine();
  const crlfDiff = "--- a/src/index.ts\r\n+++ b/src/index.ts\r\n@@ -1,4 +1,5 @@\r\n const a = 1;\r\n\r\n+const b = 2;\r\n return a;\r\n";
  const res = engine.parseAndValidate(crlfDiff, 10);
  assert.strictEqual(res.isSurgical, true);
  assert.strictEqual(res.addedLinesCount, 1);
  assert.strictEqual(res.unmodifiedLinesCount, 3);
  assert.strictEqual(res.chunks.length, 1);
});

test('GDScriptSkeletonExtractor preserves multiline typed function parameters', () => {
  const extractor = new GDScriptSkeletonExtractor();
  const code = [
    'func calculate_reward(',
    '    score: int,',
    '    multiplier: float',
    ') -> int:',
    '    var bonus: int = 10',
    '    return int(score * multiplier) + bonus',
    'func next_step() -> void:',
    '    pass'
  ].join('\n');
  const res = extractor.extract('game.gd', code);
  assert.ok(res.skeletonContent.includes('score: int,'));
  assert.ok(res.skeletonContent.includes('multiplier: float'));
  assert.ok(res.skeletonContent.includes(') -> int:'));
  assert.ok(!res.skeletonContent.includes('var bonus: int = 10'));
  assert.ok(res.skeletonContent.includes('func next_step() -> void:'));
});

test('PythonSkeletonExtractor preserves multiline typed function parameters', () => {
  const extractor = new PythonSkeletonExtractor();
  const code = [
    'def process_items(',
    '    item_id: int,',
    '    user_name: str',
    ') -> dict:',
    '    result = {item_id: user_name}',
    '    return result',
    'def finish_task():',
    '    return True'
  ].join('\n');
  const res = extractor.extract('script.py', code);
  assert.ok(res.skeletonContent.includes('item_id: int,'));
  assert.ok(res.skeletonContent.includes('user_name: str'));
  assert.ok(res.skeletonContent.includes(') -> dict:'));
  assert.ok(!res.skeletonContent.includes('result = {item_id: user_name}'));
  assert.ok(res.skeletonContent.includes('def finish_task():'));
});
