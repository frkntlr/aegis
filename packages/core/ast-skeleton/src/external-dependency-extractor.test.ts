import test from 'node:test';
import * as assert from 'node:assert';
import { ExternalDependencyExtractor } from './external-dependency-extractor.js';

test('ExternalDependencyExtractor detects external specifiers correctly', () => {
  assert.strictEqual(ExternalDependencyExtractor.isExternalSpecifier('./local.js'), false);
  assert.strictEqual(ExternalDependencyExtractor.isExternalSpecifier('../parent/file.ts'), false);
  assert.strictEqual(ExternalDependencyExtractor.isExternalSpecifier('/absolute/path'), false);
  assert.strictEqual(ExternalDependencyExtractor.isExternalSpecifier('res://player.gd'), false);
  assert.strictEqual(ExternalDependencyExtractor.isExternalSpecifier('zod'), true);
  assert.strictEqual(ExternalDependencyExtractor.isExternalSpecifier('@aegis/shared'), true);
  assert.strictEqual(ExternalDependencyExtractor.isExternalSpecifier('express/lib/router'), true);
});

test('ExternalDependencyExtractor normalizes package names', () => {
  assert.strictEqual(ExternalDependencyExtractor.normalizeLibraryName('zod'), 'zod');
  assert.strictEqual(ExternalDependencyExtractor.normalizeLibraryName('@aegis/shared/types'), '@aegis/shared');
  assert.strictEqual(ExternalDependencyExtractor.normalizeLibraryName('express/lib/router'), 'express');
  assert.strictEqual(ExternalDependencyExtractor.normalizeLibraryName("'pino'"), 'pino');
});

test('ExternalDependencyExtractor extracts TypeScript imports and require calls', () => {
  const code = `
import { z, type ZodSchema, ZodError as Err } from 'zod';
import express from 'express';
import * as path from 'node:path';
import { localHelper } from './helper.js';
const { Worker } = require('node:worker_threads');
const lodash = require('lodash');
`;
  const refs = ExternalDependencyExtractor.extractTypeScript(code, 'src/app.ts');
  const symbols = refs.map(r => r.symbol);
  assert.ok(symbols.includes('z'));
  assert.ok(symbols.includes('ZodSchema'));
  assert.ok(symbols.includes('Err'));
  assert.ok(symbols.includes('express'));
  assert.ok(symbols.includes('path'));
  assert.ok(symbols.includes('Worker'));
  assert.ok(symbols.includes('lodash'));

  const zodRef = refs.find(r => r.symbol === 'z');
  assert.strictEqual(zodRef?.library, 'zod');
  assert.strictEqual(zodRef?.isExternal, true);

  const localRef = refs.find(r => r.symbol === 'localHelper');
  assert.strictEqual(localRef?.isExternal, false);
});

test('ExternalDependencyExtractor extracts GDScript extends and preload calls', () => {
  const gdCode = `
extends CharacterBody3D
# Comments should be ignored
# extends Node2D
const Bullet = preload("res://scenes/bullet.tscn")
`;
  const refs = ExternalDependencyExtractor.extractGDScript(gdCode, 'player.gd');
  assert.strictEqual(refs.length, 2);

  const extRef = refs.find(r => r.kind === 'extends');
  assert.strictEqual(extRef?.symbol, 'CharacterBody3D');
  assert.strictEqual(extRef?.library, 'godot4');
  assert.strictEqual(extRef?.isExternal, true);

  const preloadRef = refs.find(r => r.kind === 'preload');
  assert.strictEqual(preloadRef?.symbol, 'res://scenes/bullet.tscn');
  assert.strictEqual(preloadRef?.isExternal, false);
});

test('ExternalDependencyExtractor extracts C# using and inheritance', () => {
  const csCode = `
using System.Text.Json;
using Godot;
// using Commented;

public class PlayerController : CharacterBody2D, IDisposable {
}
`;
  const refs = ExternalDependencyExtractor.extractCSharp(csCode, 'Player.cs');
  const symbols = refs.map(r => r.symbol);
  assert.ok(symbols.includes('System.Text.Json'));
  assert.ok(symbols.includes('Godot'));
  assert.ok(symbols.includes('CharacterBody2D'));
  assert.ok(symbols.includes('IDisposable'));
});

test('ExternalDependencyExtractor dispatches by file extension', () => {
  const tsRefs = ExternalDependencyExtractor.extract('main.ts', "import { foo } from 'bar';");
  assert.strictEqual(tsRefs[0].symbol, 'foo');

  const gdRefs = ExternalDependencyExtractor.extract('main.gd', 'extends Node');
  assert.strictEqual(gdRefs[0].symbol, 'Node');

  const unknown = ExternalDependencyExtractor.extract('README.md', '# Title');
  assert.strictEqual(unknown.length, 0);
});
