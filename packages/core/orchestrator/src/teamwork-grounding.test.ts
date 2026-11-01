import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkGroundingEngine } from './teamwork-grounding.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

test('TeamworkGroundingEngine inspects nonexistent file safely', () => {
  const engine = new TeamworkGroundingEngine();
  const rep = engine.inspectFile('nonexistent/path/file.ts');
  assert.strictEqual(rep.exists, false);
  assert.strictEqual(rep.lineCount, 0);
  assert.strictEqual(rep.headroom, 300);
  assert.strictEqual(rep.budgetStatus, 'healthy');
});

test('TeamworkGroundingEngine inspects existing file and extracts skeleton and line budget', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ground-test-'));
  try {
    const testFile = path.join(tmpDir, 'service.ts');
    fs.writeFileSync(testFile, 'export class DataService {\n  public fetchData(): string[] {\n    return ["a"];\n  }\n}\n', 'utf8');

    const engine = new TeamworkGroundingEngine(tmpDir);
    const rep = engine.inspectFile('service.ts');

    assert.strictEqual(rep.exists, true);
    assert.ok(rep.lineCount >= 4);
    assert.ok(rep.headroom <= 296);
    assert.strictEqual(rep.budgetStatus, 'healthy');
    assert.ok(rep.skeleton.includes('DataService'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkGroundingEngine builds markdown grounding section with zero hallucination info', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ground-sec-'));
  try {
    const fileA = path.join(tmpDir, 'auth.ts');
    fs.writeFileSync(fileA, 'export interface UserSession { id: string; role: string; }\n', 'utf8');

    const engine = new TeamworkGroundingEngine(tmpDir);
    const section = engine.buildGroundingSection(['auth.ts', 'missing.ts']);

    assert.ok(section.includes('Ground-Truth Codebase Reality (Zero-Hallucination)'));
    assert.ok(section.includes('auth.ts'));
    assert.ok(section.includes('UserSession'));
    assert.ok(section.includes('New File to Create'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkGroundingEngine builds upstream contracts section for dependent tracks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-contract-sec-'));
  try {
    const fileA = path.join(tmpDir, 'parser.ts');
    fs.writeFileSync(fileA, 'export function parseSource(code: string): object { return {}; }\n', 'utf8');

    const engine = new TeamworkGroundingEngine(tmpDir);
    const section = engine.buildUpstreamContractsSection([
      { subagentName: 'issue-solver [Parser]', files: ['parser.ts'] }
    ]);

    assert.ok(section.includes('Upstream Dependency Contracts (Verified Interfaces)'));
    assert.ok(section.includes('issue-solver [Parser]'));
    assert.ok(section.includes('parseSource'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCoordinator integrates grounding engine into track prompts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-coord-ground-'));
  try {
    const fileA = path.join(tmpDir, 'core.ts');
    fs.writeFileSync(fileA, 'export class EngineCore { start(): void {} }\n', 'utf8');

    const coordinator = new TeamworkCoordinator(tmpDir);
    const plan = coordinator.planTeamwork('Implement core and audit', ['core.ts']);

    const solver = plan.tracks.find(t => t.roleType === 'solver');
    assert.ok(solver?.prompt.includes('Ground-Truth Codebase Reality'));
    assert.ok(solver?.prompt.includes('EngineCore'));
    assert.ok(solver?.prompt.includes('Anti-Hallucination & Codebase Invariants'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
