import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkeletonGenerator } from '@aegis/ast-skeleton';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';

class CountingGenerator extends SkeletonGenerator {
  calls = 0;
  override extractFile(file: string, content: string) {
    this.calls++;
    return super.extractFile(file, content);
  }
}

function fixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ground-cache-'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('path aliases share extraction and callers cannot mutate cached evidence', () => fixture(root => {
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const original = 1;');
  const generator = new CountingGenerator();
  const engine = new TeamworkGroundingEngine(root, generator);
  const first = engine.inspectFile('a.ts');
  first.skeleton = 'caller mutation';
  assert.match(engine.inspectFile('./a.ts').skeleton, /original/);
  assert.equal(generator.calls, 1);
  const section = engine.buildGroundingSection(['a.ts', './a.ts', path.join(root, 'a.ts')]);
  assert.equal(section.match(/Lines:/g)?.length, 1);
  assert.equal(generator.calls, 1);
}));

test('same-size edits invalidate cached extraction even with restored mtime', () => fixture(root => {
  const file = path.join(root, 'a.ts');
  fs.writeFileSync(file, 'export const alpha = 1;');
  const fixed = new Date('2020-01-01T00:00:00.000Z');
  fs.utimesSync(file, fixed, fixed);
  const generator = new CountingGenerator();
  const engine = new TeamworkGroundingEngine(root, generator);
  engine.inspectFile('a.ts');
  fs.writeFileSync(file, 'export const bravo = 2;');
  fs.utimesSync(file, fixed, fixed);
  assert.match(engine.inspectFile('a.ts').skeleton, /bravo/);
  assert.equal(generator.calls, 2);
}));

test('unavailable existing sources are never described as new files', () => fixture(root => {
  const engine = new TeamworkGroundingEngine(root);
  assert.match(engine.buildGroundingSection(['.']), /Grounding unavailable/);
  assert.doesNotMatch(engine.buildGroundingSection(['.']), /New File to Create/);
  assert.match(engine.buildGroundingSection(['missing.ts']), /New File to Create/);
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;');
  class BrokenGenerator extends SkeletonGenerator {
    override extractFile(): never { throw new Error('Parser failed'); }
  }
  const broken = new TeamworkGroundingEngine(root, new BrokenGenerator());
  assert.match(broken.buildGroundingSection(['a.ts']), /extraction failed/);
  assert.doesNotMatch(broken.buildGroundingSection(['a.ts']), /New File to Create/);
}));

test('large and duplicate scopes have bounded grounding with honest omissions', () => fixture(root => {
  const source = Array.from({ length: 80 }, (_, i) => `export function member${i}(v: string): string { return v; }`).join('\n');
  const files = Array.from({ length: 24 }, (_, i) => `f${i}.ts`);
  for (const file of files) fs.writeFileSync(path.join(root, file), source);
  const generator = new CountingGenerator();
  const engine = new TeamworkGroundingEngine(root, generator);
  const section = engine.buildGroundingSection(files.flatMap(file => [file, `./${file}`]));
  assert.equal(generator.calls, 8);
  assert.ok(section.length < 18000);
  assert.match(section, /16 additional file\(s\) omitted/);
  assert.match(section, /partial observations, not verified complete interfaces/);
  assert.match(section, /Excerpt truncated/);
  const contracts = engine.buildUpstreamContractsSection([{ subagentName: 'upstream', files: [...files, ...files] }]);
  assert.equal(generator.calls, 8);
  assert.ok(contracts.length < 18000);
  assert.match(contracts, /16 additional upstream file\(s\) omitted/);
  assert.match(contracts, /completeness and runtime compatibility are not verified/);
}));

test('single-line AST signatures are bounded and clearly marked incomplete', () => fixture(root => {
  fs.writeFileSync(path.join(root, 'a.ts'), `export interface Huge { ${Array.from({ length: 1000 }, (_, i) => `field${i}: string;`).join(' ')} }`);
  const report = new TeamworkGroundingEngine(root).inspectFile('a.ts');
  assert.ok(report.skeleton.length < 1900);
  assert.match(report.skeleton, /Excerpt truncated/);
}));
