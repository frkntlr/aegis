#!/usr/bin/env node
/**
 * Aegis Atomic Merge Runner (Legacy / Script Wrapper)
 * Delegates to: node packages/cli/dist/bin/aegis.js merge <agentName> [baseBranch]
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js');

const args = process.argv.slice(2);
const result = spawnSync('node', [cliBin, 'merge', ...args], {
  cwd: repoRoot,
  stdio: 'inherit'
});

process.exit(result.status ?? 0);
