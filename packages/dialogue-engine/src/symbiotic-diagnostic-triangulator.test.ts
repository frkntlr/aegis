/**
 * @file symbiotic-diagnostic-triangulator.test.ts
 * Tests for SymbioticDiagnosticTriangulator boundary defect diagnosis.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import {
  SymbioticDiagnosticTriangulator,
  type BoundaryContractContext
} from './symbiotic-diagnostic-triangulator.js';
import { DynamicHypothesisGenerator } from './hypothesis-generator.js';
import { DiagnosticCategory } from './types.js';

test('SymbioticDiagnosticTriangulator parses signatures correctly', () => {
  const s1 = SymbioticDiagnosticTriangulator.parseSignature('connect(url: string)');
  assert.strictEqual(s1.minArgs, 1);
  assert.strictEqual(s1.maxArgs, 1);

  const s2 = SymbioticDiagnosticTriangulator.parseSignature('query(sql: string, params?: string[])');
  assert.strictEqual(s2.minArgs, 1);
  assert.strictEqual(s2.maxArgs, 2);

  const s3 = SymbioticDiagnosticTriangulator.parseSignature('fetch(url: string, timeout = 5000)');
  assert.strictEqual(s3.minArgs, 1);
  assert.strictEqual(s3.maxArgs, 2);

  const s4 = SymbioticDiagnosticTriangulator.parseSignature('log(msg: string, ...rest: string[])');
  assert.strictEqual(s4.minArgs, 1);
  assert.strictEqual(s4.maxArgs, Number.POSITIVE_INFINITY);

  const s5 = SymbioticDiagnosticTriangulator.parseSignature('close()');
  assert.strictEqual(s5.minArgs, 0);
  assert.strictEqual(s5.maxArgs, 0);

  const s6 = SymbioticDiagnosticTriangulator.parseSignature('invalidSignature');
  assert.strictEqual(s6.minArgs, 0);
});

test('SymbioticDiagnosticTriangulator counts call site arguments accurately', () => {
  assert.strictEqual(SymbioticDiagnosticTriangulator.countCallArguments('client.close()', 'close'), 0);
  assert.strictEqual(SymbioticDiagnosticTriangulator.countCallArguments('client.connect("http://localhost")', 'connect'), 1);
  assert.strictEqual(SymbioticDiagnosticTriangulator.countCallArguments('bridge.query("zod", "z.object")', 'query'), 2);
  assert.strictEqual(SymbioticDiagnosticTriangulator.countCallArguments('fn({ a: 1, b: 2 }, [3, 4])', 'fn'), 2);
  assert.strictEqual(SymbioticDiagnosticTriangulator.countCallArguments('log("hello, world", "foo, bar")', 'log'), 2);
  assert.strictEqual(SymbioticDiagnosticTriangulator.countCallArguments('const x = 10', 'fn'), 0);
});

test('SymbioticDiagnosticTriangulator detects deprecated upstream APIs', () => {
  const contract: BoundaryContractContext = {
    library: 'godot4',
    symbol: 'get_node',
    isDeprecated: true,
    deprecationNotice: 'Use %UniqueName or @onready var instead.'
  };

  const res = SymbioticDiagnosticTriangulator.triangulate({
    callSiteCode: 'get_node("Hero")',
    contract
  });

  assert.strictEqual(res.isBoundaryDefect, true);
  assert.strictEqual(res.discrepancyType, 'DEPRECATED_API');
  assert.ok(res.falsifiableHypothesis.includes('[DEPRECATED_API]'));
  assert.ok(res.explanation.includes('is deprecated'));

  const opt = SymbioticDiagnosticTriangulator.toClarificationOption(res);
  assert.ok(opt !== undefined);
  assert.strictEqual(opt?.hypothesisKey, 'BOUNDARY_DEPRECATED_API');
});

test('SymbioticDiagnosticTriangulator detects arity mismatch', () => {
  const contract: BoundaryContractContext = {
    library: 'zod',
    symbol: 'object',
    expectedSignature: 'object(shape: ZodRawShape): ZodObject'
  };

  const resTooMany = SymbioticDiagnosticTriangulator.triangulate({
    callSiteCode: 'z.object(shape, extraOptions, callback)',
    contract
  });

  assert.strictEqual(resTooMany.isBoundaryDefect, true);
  assert.strictEqual(resTooMany.discrepancyType, 'ARITY_MISMATCH');
  assert.strictEqual(resTooMany.actualArgCount, 3);
  assert.strictEqual(resTooMany.expectedMinArgs, 1);
  assert.strictEqual(resTooMany.expectedMaxArgs, 1);
  assert.ok(resTooMany.falsifiableHypothesis.includes('[ARITY_MISMATCH]'));

  const resTooFew = SymbioticDiagnosticTriangulator.triangulate({
    callSiteCode: 'z.object()',
    contract
  });
  assert.strictEqual(resTooFew.isBoundaryDefect, true);
  assert.strictEqual(resTooFew.discrepancyType, 'ARITY_MISMATCH');
  assert.strictEqual(resTooFew.actualArgCount, 0);
});

test('SymbioticDiagnosticTriangulator evaluates runtime type and signature errors', () => {
  const contract: BoundaryContractContext = {
    library: 'axios',
    symbol: 'get',
    expectedSignature: 'get(url: string, config?: AxiosRequestConfig)'
  };

  const notFuncRes = SymbioticDiagnosticTriangulator.triangulate({
    callSiteCode: 'axios.get("/api")',
    contract,
    runtimeError: 'TypeError: axios.get is not a function'
  });
  assert.strictEqual(notFuncRes.isBoundaryDefect, true);
  assert.strictEqual(notFuncRes.discrepancyType, 'SIGNATURE_MISMATCH');

  const typeRes = SymbioticDiagnosticTriangulator.triangulate({
    callSiteCode: 'axios.get("/api")',
    contract,
    runtimeError: 'TypeError: Cannot read properties of undefined (reading params)'
  });
  assert.strictEqual(typeRes.isBoundaryDefect, true);
  assert.strictEqual(typeRes.discrepancyType, 'TYPE_MISMATCH');
});

test('SymbioticDiagnosticTriangulator returns clean result for compliant calls', () => {
  const contract: BoundaryContractContext = {
    library: 'node:fs',
    symbol: 'readFileSync',
    expectedSignature: 'readFileSync(path: PathOrFileDescriptor, options?: Encoding): string'
  };

  const res = SymbioticDiagnosticTriangulator.triangulate({
    callSiteCode: 'fs.readFileSync("file.txt", "utf8")',
    contract
  });

  assert.strictEqual(res.isBoundaryDefect, false);
  assert.strictEqual(res.discrepancyType, 'NONE');
  assert.strictEqual(SymbioticDiagnosticTriangulator.toClarificationOption(res), undefined);
});

test('DynamicHypothesisGenerator prioritizes boundary clarification option', () => {
  const opt = {
    id: 'hyp-boundary-arity_mismatch',
    label: '[zod] arity mismatch',
    hypothesisKey: 'BOUNDARY_ARITY_MISMATCH',
    confidenceScore: 0.95
  };

  const options = DynamicHypothesisGenerator.generate(DiagnosticCategory.UNKNOWN, undefined, undefined, opt);
  assert.strictEqual(options.length, 1);
  assert.strictEqual(options[0].hypothesisKey, 'BOUNDARY_ARITY_MISMATCH');
});
