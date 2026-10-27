/**
 * @file transitive-type-closure.test.ts
 * Tests for TransitiveTypeClosure Bounded Depth, Opaque Stubbing, and Circuit Breaker.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { TransitiveTypeClosure } from './transitive-type-closure.js';

test('TransitiveTypeClosure extracts 1st-degree and stubs 2nd-degree types', () => {
  const code = `
    export interface LocalUser {
      id: string;
      profile: UserProfile;
    }
    export function getUser(id: string): LocalUser {
      return {} as LocalUser;
    }
  `;

  const closure = new TransitiveTypeClosure({
    maxDepth: 1,
    enableOpaqueStubbing: true,
    sourceFileProvider: () => null
  });

  const res = closure.resolveClosure('getUser', 'user-service.ts', code);
  assert.strictEqual(res.fullDeclarations.length, 1);
  assert.ok(res.fullDeclarations[0]?.includes('interface LocalUser'));
  assert.strictEqual(res.opaqueStubs.length, 1);
  assert.ok(res.opaqueStubs[0]?.includes("export type UserProfile = { readonly __opaque: 'UserProfile' };"));
  assert.strictEqual(res.exceededBudget, false);
});

test('TransitiveTypeClosure handles generic monomorphization cleanly', () => {
  const code = `
    export interface Container<T> {
      value: T;
      payload: NestedData<T>;
    }
    export function wrapData(c: Container<string>): void {}
  `;

  const closure = new TransitiveTypeClosure({ maxDepth: 1 });
  const res = closure.resolveClosure('wrapData', 'container.ts', code);

  assert.ok(res.fullDeclarations.length >= 1);
  const mono = TransitiveTypeClosure.monomorphizeGeneric('Container', ['string', 'number']);
  assert.strictEqual(mono, 'Container_string_number');
});

test('TransitiveTypeClosure triggers circuit breaker when line budget is exceeded', () => {
  const code = `
    export interface BigType {
      f1: string;
      f2: string;
      f3: string;
    }
    export function processBig(b: BigType): void {}
  `;

  const closure = new TransitiveTypeClosure({
    lineBudget: 2 // Intentionally low to test circuit breaker
  });

  const res = closure.resolveClosure('processBig', 'big.ts', code);
  assert.strictEqual(res.exceededBudget, true);
  assert.ok(res.formattedBlock.includes('Token Guardrail'));
  assert.ok(res.formattedBlock.includes('exceeded budget'));
});

test('TransitiveTypeClosure handles non-existent symbol gracefully', () => {
  const code = 'export const a = 1;';
  const closure = new TransitiveTypeClosure();
  const res = closure.resolveClosure('missingSymbol', 'missing.ts', code);
  assert.strictEqual(res.fullDeclarations.length, 0);
  assert.strictEqual(res.formattedBlock, '');
  assert.strictEqual(res.totalLines, 0);
});

test('extractTypeIdentifiers and generateOpaqueStub work accurately', () => {
  const ids = TransitiveTypeClosure.extractTypeIdentifiers('Record<string, CustomerOrder | PendingInvoice>');
  assert.deepStrictEqual(ids, ['CustomerOrder', 'PendingInvoice']);

  const stub = TransitiveTypeClosure.generateOpaqueStub('OrderBatch');
  assert.strictEqual(stub, "export type OrderBatch = { readonly __opaque: 'OrderBatch' };");
});

test('TransitiveTypeClosure resolves barrel re-exports accurately', () => {
  const barrelCode = "export { Account } from './models.js';";
  const modelsCode = 'export interface Account { id: string; balance: number; }';
  const callerCode = "import { Account } from './barrel.js';\nexport function audit(acc: Account): void {}";

  const closure = new TransitiveTypeClosure({
    maxDepth: 1,
    sourceFileProvider: (targetPath: string) => {
      if (targetPath.endsWith('barrel.js') || targetPath.endsWith('barrel.ts')) return barrelCode;
      if (targetPath.endsWith('models.js') || targetPath.endsWith('models.ts')) return modelsCode;
      return null;
    }
  });

  const res = closure.resolveClosure('audit', 'audit.ts', callerCode);
  assert.strictEqual(res.fullDeclarations.length, 1);
  assert.ok(res.fullDeclarations[0]?.includes('interface Account'));
});

test('TransitiveTypeClosure shields global runtime types from opaque stubbing', () => {
  const code = 'export function streamData(buf: Buffer, url: URL, sig: AbortSignal): ReadableStream { return null!; }';
  const closure = new TransitiveTypeClosure();
  const res = closure.resolveClosure('streamData', 'stream.ts', code);
  assert.strictEqual(res.opaqueStubs.length, 0);
  assert.strictEqual(res.fullDeclarations.length, 0);
});
