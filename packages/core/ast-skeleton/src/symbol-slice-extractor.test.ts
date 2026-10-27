import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TransitiveTypeResolver } from './transitive-type-resolver.js';
import { CalleeSignatureExtractor } from './callee-signature-extractor.js';
import { SymbolSliceExtractor } from './symbol-slice-extractor.js';
import { SymbolIndexer } from './symbol-indexer.js';

test('TransitiveTypeResolver: extracts type identifiers and ignores primitives', () => {
  const ids = TransitiveTypeResolver.extractTypeIdentifiers('Promise<DamagePayload[]> | Record<string, AttackResult> | void');
  assert.deepStrictEqual(ids.sort(), ['AttackResult', 'DamagePayload'].sort());
});

test('TransitiveTypeResolver: extracts local parameter and return types for function', () => {
  const resolver = new TransitiveTypeResolver();
  const code = [
    'export interface DamagePayload { amount: number; critical: boolean; }',
    'export interface CombatResult { success: boolean; }',
    'export function processAttack(payload: DamagePayload): CombatResult {',
    '  return { success: payload.amount > 0 };',
    '}'
  ].join('\n');

  const closure = resolver.resolveAmbientClosure('processAttack', 'combat.ts', code);
  assert.strictEqual(closure.typeNames.length, 2);
  assert.ok(closure.typeNames.includes('DamagePayload'));
  assert.ok(closure.typeNames.includes('CombatResult'));
  assert.ok(closure.formattedBlock.includes('interface DamagePayload'));
  assert.ok(closure.formattedBlock.includes('interface CombatResult'));
});

test('TransitiveTypeResolver: resolves imported types from relative source file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-type-test-'));
  const typesFile = path.join(tmpDir, 'types.ts');
  const serviceFile = path.join(tmpDir, 'service.ts');

  fs.writeFileSync(typesFile, 'export interface UserProfile { id: string; name: string; }', 'utf8');
  fs.writeFileSync(serviceFile, [
    "import { UserProfile } from './types.js';",
    'export function fetchUser(id: string): Promise<UserProfile> {',
    '  return Promise.resolve({ id, name: "Alice" });',
    '}'
  ].join('\n'), 'utf8');

  const resolver = new TransitiveTypeResolver({ baseDir: tmpDir });
  const content = fs.readFileSync(serviceFile, 'utf8');
  const closure = resolver.resolveAmbientClosure('fetchUser', serviceFile, content);

  assert.strictEqual(closure.typeNames.length, 1);
  assert.strictEqual(closure.typeNames[0], 'UserProfile');
  assert.ok(closure.formattedBlock.includes('interface UserProfile'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TransitiveTypeResolver: safely handles cyclic types and resolves transitive types within depth limit', () => {
  const resolver = new TransitiveTypeResolver();
  const code = [
    'export interface NodeA { id: string; next: NodeB; }',
    'export interface NodeB { id: string; prev: NodeA; extra: NodeC; }',
    'export interface NodeC { details: string; deep: NodeD; }',
    'export interface NodeD { depth: number; }',
    'export function traverse(root: NodeA): void {',
    '  console.log(root);',
    '}'
  ].join('\n');

  const closure = resolver.resolveAmbientClosure('traverse', 'graph.ts', code, 3);
  assert.ok(closure.typeNames.includes('NodeA'));
  assert.ok(closure.typeNames.includes('NodeB'));
  assert.ok(closure.typeNames.includes('NodeC'));
  // NodeD is depth 4, so with maxDepth 3 it should not be included
  assert.strictEqual(closure.typeNames.includes('NodeD'), false);
  assert.ok(closure.formattedBlock.includes('interface NodeA'));
  assert.ok(closure.formattedBlock.includes('interface NodeB'));
  assert.ok(closure.formattedBlock.includes('interface NodeC'));
});

test('SymbolSliceExtractor: prepends ambient type closure block to surgical slice', () => {
  const indexer = new SymbolIndexer();
  const extractor = new SymbolSliceExtractor(indexer);

  const code = [
    'export interface OrderOptions { fastDelivery: boolean; }',
    'export interface OrderReceipt { orderId: string; }',
    'export function placeOrder(opts: OrderOptions): OrderReceipt {',
    '  return { orderId: "123" };',
    '}'
  ].join('\n');

  const slice = extractor.sliceContent('placeOrder', 'order.ts', code, 3, 5, 1);
  assert.ok(slice.codeSlice.includes('// 📦 [Ambient Type Closure - Param & Return Types]'));
  assert.ok(slice.codeSlice.includes('interface OrderOptions'));
  assert.ok(slice.codeSlice.includes('interface OrderReceipt'));
  assert.ok(slice.ambientTypes?.includes('OrderOptions'));
  assert.ok(slice.ambientTypes?.includes('OrderReceipt'));
});

test('SymbolSliceExtractor: injects bounded opaque stubs for nested 2nd-degree types', () => {
  const indexer = new SymbolIndexer();
  const extractor = new SymbolSliceExtractor(indexer);

  const code = [
    'export interface ServiceConfig { options: RemoteDriverOptions; }',
    'export function initService(cfg: ServiceConfig): void {}'
  ].join('\n');

  const slice = extractor.sliceContent('initService', 'service.ts', code, 2, 2, 1);
  assert.ok(slice.codeSlice.includes('interface ServiceConfig'));
  assert.ok(slice.codeSlice.includes('RemoteDriverOptions'));
  assert.ok(slice.codeSlice.includes('__opaque'));
});

test('CalleeSignatureExtractor: extracts 1st-degree method signatures within class and functions', () => {
  const extractor = new CalleeSignatureExtractor();
  const code = [
    'export class Calculator {',
    '  private multiply(a: number, b: number): number { return a * b; }',
    '  public computeSquare(n: number): number {',
    '    return this.multiply(n, n);',
    '  }',
    '}'
  ].join('\n');

  const res = extractor.extractCalleeSignatures('computeSquare', 'calc.ts', code);
  assert.strictEqual(res.signatures.length, 1);
  assert.ok(res.signatures[0].includes('this.multiply(a: number, b: number): number;'));
  assert.ok(res.formattedBlock.includes('// 🔗 [Callee Signatures - 1st Degree Invocations]'));
});

test('SymbolSliceExtractor: injects both ambient types and callee signatures into slice', () => {
  const indexer = new SymbolIndexer();
  const extractor = new SymbolSliceExtractor(indexer);

  const code = [
    'export interface PaymentRequest { amount: number; }',
    'export interface PaymentResponse { ok: boolean; }',
    'export class Cashier {',
    '  private authorize(req: PaymentRequest): boolean { return req.amount > 0; }',
    '  public checkout(req: PaymentRequest): PaymentResponse {',
    '    const valid = this.authorize(req);',
    '    return { ok: valid };',
    '  }',
    '}'
  ].join('\n');

  const slice = extractor.sliceContent('checkout', 'cashier.ts', code, 5, 8, 1);
  assert.ok(slice.codeSlice.includes('// 📦 [Ambient Type Closure - Param & Return Types]'));
  assert.ok(slice.codeSlice.includes('interface PaymentRequest'));
  assert.ok(slice.codeSlice.includes('interface PaymentResponse'));
  assert.ok(slice.codeSlice.includes('// 🔗 [Callee Signatures - 1st Degree Invocations]'));
  assert.ok(slice.codeSlice.includes('this.authorize(req: PaymentRequest): boolean;'));
  assert.ok(slice.calleeSignatures?.some(s => s.includes('authorize')));
});

test('SymbolSliceExtractor: activates adaptive ClassSkeleton mode for class symbols with folded method bodies', () => {
  const indexer = new SymbolIndexer();
  const extractor = new SymbolSliceExtractor(indexer);

  const heavyClassCode = [
    'export class DatabaseCluster {',
    '  private connectionPool: any[];',
    '  constructor(url: string) {',
    '    this.connectionPool = [];',
    '    for (let i = 0; i < 50; i++) { this.connectionPool.push({ id: i, active: true }); }',
    '  }',
    '  public executeQuery(sql: string): any {',
    '    const log = "Executing query: " + sql;',
    '    return { rows: [], time: 12 };',
    '  }',
    '  public close(): void {',
    '    this.connectionPool = [];',
    '  }',
    '}'
  ].join('\n');

  const slice = extractor.extractClassSkeletonSlice('DatabaseCluster', 'db.ts', heavyClassCode, 1, 14);
  assert.ok(slice !== null);
  assert.ok(slice.codeSlice.includes('class DatabaseCluster'));
  assert.ok(slice.codeSlice.includes('constructor(url: string) { /* folded */ }'));
  assert.ok(slice.codeSlice.includes('executeQuery(sql: string): any { /* folded */ }'));
  assert.ok(slice.codeSlice.includes('close(): void { /* folded */ }'));
  assert.ok(!slice.codeSlice.includes('connectionPool.push'));
  assert.ok(slice.tokenSavingsPercent >= 50);
});

test('SymbolSliceExtractor: preserves GDScript signals, extends, and @onready ambient state', () => {
  const extractor = new SymbolSliceExtractor();
  const gdCode = [
    'class_name Hero',
    'extends CharacterBody2D',
    'signal hero_damaged(amount: int)',
    '@onready var anim = $AnimationPlayer',
    '@export var speed: float = 200.0',
    '',
    'func take_damage(amount: int) -> void:',
    '    hero_damaged.emit(amount)',
    '    anim.play("hurt")'
  ].join('\n');

  const slice = extractor.sliceContent('take_damage', 'hero.gd', gdCode, 7, 9, 1);
  assert.ok(slice.codeSlice.includes('# 🎮 [GDScript Ambient State - Signals & Onready Nodes]'));
  assert.ok(slice.codeSlice.includes('extends CharacterBody2D'));
  assert.ok(slice.codeSlice.includes('signal hero_damaged(amount: int)'));
  assert.ok(slice.codeSlice.includes('@onready var anim = $AnimationPlayer'));
  assert.ok(slice.codeSlice.includes('@export var speed: float = 200.0'));
});

test('SymbolSliceExtractor: dynamically expands context lines upwards to capture entire multi-line docstring', () => {
  const extractor = new SymbolSliceExtractor();
  const code = [
    '// line 1',
    '// line 2',
    '// line 3',
    '/**',
    ' * Calculates player level based on experience points',
    ' * @param xp Total experience points',
    ' * @returns Level number between 1 and 100',
    ' */',
    'export function calculateLevel(xp: number): number {',
    '  return Math.min(100, Math.floor(xp / 1000) + 1);',
    '}'
  ].join('\n');

  // Requesting slice with contextLines = 1 should still capture the 5-line docstring above calculateLevel
  const slice = extractor.sliceContent('calculateLevel', 'calc.ts', code, 9, 11, 1);
  assert.ok(slice.codeSlice.includes('Calculates player level based on experience points'));
  assert.ok(slice.codeSlice.includes('@param xp Total experience points'));
  assert.ok(slice.codeSlice.includes('@returns Level number between 1 and 100'));
});
