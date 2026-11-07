import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectBootstrapEngine } from './project-bootstrap.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';
import { TeamworkDocSynthesizer } from './teamwork-doc-synthesizer.js';

test('ProjectBootstrapEngine detects uninitialized repo and bootstraps files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-bootstrap-test-'));
  try {
    assert.strictEqual(ProjectBootstrapEngine.isRepoInitialized(tmpDir), false);
    const result = ProjectBootstrapEngine.bootstrap(tmpDir, { projectName: 'TestApp' });

    assert.strictEqual(result.repoRoot, tmpDir);
    assert.strictEqual(ProjectBootstrapEngine.isRepoInitialized(tmpDir), true);
    assert.ok(fs.existsSync(path.join(tmpDir, '.git')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.gitignore')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'README.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'docs', 'rfc')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.aegis', 'task-inbox.json')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ProjectBootstrapEngine creates valid template contents and skips when initialized', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-bootstrap-verify-'));
  try {
    ProjectBootstrapEngine.bootstrap(tmpDir, { projectName: 'TestApp', description: 'Sample description' });
    const gitignoreContent = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(gitignoreContent.includes('node_modules/'));
    assert.ok(gitignoreContent.includes('.aegis/locks.json'));

    const readmeContent = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    assert.ok(readmeContent.includes('# TestApp'));
    assert.ok(readmeContent.includes('<!-- AEGIS_ARCHITECTURE_START -->'));

    const inboxContent = fs.readFileSync(path.join(tmpDir, '.aegis', 'task-inbox.json'), 'utf8');
    assert.strictEqual(inboxContent.trim(), '[]');

    const second = ProjectBootstrapEngine.bootstrap(tmpDir);
    assert.strictEqual(second.initializedGit, false);
    assert.strictEqual(second.createdGitignore, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCoordinator automatically bootstraps empty workspace on instantiation', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-coord-boot-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.git')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.gitignore')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'README.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.aegis', 'task-inbox.json')));

    const plan = coordinator.planTeamwork('Build zero-config architecture', ['src/main.ts']);
    assert.ok(plan.planId.startsWith('tw-'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkDocSynthesizer updateReadme replaces architecture block in README.md', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-doc-readme-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const plan = coordinator.planTeamwork('Implement core cache service', ['src/cache.ts']);
    coordinator.mesh.initializeMesh(plan.planId, plan.objective, plan.tracks);

    const synthesizer = new TeamworkDocSynthesizer(tmpDir, coordinator.mesh);
    const updated = synthesizer.updateReadme(plan.planId);
    assert.strictEqual(updated.updated, true);

    const readmeContent = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    assert.ok(readmeContent.includes('<!-- AEGIS_ARCHITECTURE_START -->') || readmeContent.includes('<!-- AEGIS:ARCHITECTURE:START -->'));
    assert.ok(readmeContent.includes('Aegis Living Architecture'));
    assert.ok(readmeContent.includes('<!-- AEGIS_ARCHITECTURE_END -->') || readmeContent.includes('<!-- AEGIS:ARCHITECTURE:END -->'));

    // Static helper test
    const staticUpdated = TeamworkDocSynthesizer.updateReadme(plan.planId, tmpDir);
    assert.strictEqual(staticUpdated.updated, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
