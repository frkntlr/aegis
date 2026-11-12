#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { configureAntigravity, installUserShims } = require('./setup-aegis-config.cjs');

function parseOptions(args, engine = path.resolve(__dirname, '..')) {
  const options = { engine, project: engine, client: 'both', user: false, dryRun: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    const match = /^--(client|project)(?:=(.*))?$/.exec(raw);
    const key = match?.[1] || ({ '--user': 'user', '--dry-run': 'dryRun', '--help': 'help', '-h': 'help' })[raw];
    if (!key || seen.has(key)) throw new Error(`Unknown or repeated setup argument: ${raw}`);
    seen.add(key);
    if (match) {
      const value = match[2] === undefined ? args[++i] : match[2];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
      options[key] = key === 'project' ? path.resolve(value) : value;
    } else options[key] = true;
  }
  if (!['codex', 'antigravity', 'both'].includes(options.client)) throw new Error('--client must be codex, antigravity or both');
  return options;
}

function npmInvocation(engine) {
  const candidates = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(file => file && /npm-cli\.js$/.test(file) && fs.existsSync(file));
  if (cli) return [process.execPath, [cli]];
  if (process.platform !== 'win32') return ['npm', []];
  throw new Error('npm CLI not found. Run this installer with npm run setup, or install Node.js with npm.');
}

function runChild(command, args, cwd, capture = false) {
  const env = { ...process.env, AEGIS_WORKSPACE: cwd, AEGIS_INBOX_PATH: path.join(cwd, '.aegis/task-inbox.json') };
  const result = spawnSync(command, args, { cwd, env, windowsHide: true, shell: false,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Setup step failed (${result.status ?? result.signal}): ${command} ${args.join(' ')}`);
  return result.stdout || '';
}

function dependenciesMissing(engine) {
  try {
    for (const dependency of ['typescript', 'turbo', 'esbuild', 'smol-toml']) require.resolve(dependency, { paths: [engine] });
    const lock = path.join(engine, 'package-lock.json');
    const installed = path.join(engine, 'node_modules/.package-lock.json');
    return fs.existsSync(lock) && (!fs.existsSync(installed) || fs.statSync(lock).mtimeMs > fs.statSync(installed).mtimeMs);
  } catch { return true; }
}

function requireProject(project) {
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new Error(`Project directory does not exist: ${project}`);
  if (!['.git', 'package.json', 'project.godot'].some(file => fs.existsSync(path.join(project, file)))) {
    throw new Error(`Not a project directory: ${project}; select an existing Git, Node.js or Godot project`);
  }
}

function configureUser(options, run, npm) {
  const files = [];
  if (options.client !== 'antigravity') {
    run(process.execPath, [path.join(options.engine, 'scripts/install-codex-commands.cjs')], options.engine);
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    files.push(path.join(os.homedir(), '.agents/skills/aegis/SKILL.md'), path.join(codexHome, 'AGENTS.md'));
  }
  const prefix = run(npm[0], [...npm[1], 'prefix', '-g'], options.engine, true).trim();
  if (!prefix || !path.isAbsolute(prefix)) throw new Error('npm prefix -g did not return an absolute path');
  return [...files, ...installUserShims(options.engine, prefix)];
}

function runSetup(options, injected = {}) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Aegis setup requires Node.js 20 or newer');
  requireProject(options.project);
  const run = injected.run || runChild;
  const log = injected.log || console.log;
  const cli = path.join(options.engine, 'packages/cli/dist/bin/aegis.js');
  if (options.dryRun) {
    log(`DRY RUN: dependencies if missing; build; configure ${options.client} in ${options.project}${options.user ? '; install user command shims' + (options.client !== 'antigravity' ? ' and Codex routing' : '') : ''}; check status. No changes made.`);
    return;
  }
  const npm = injected.npm || npmInvocation(options.engine);
  if ((injected.dependenciesMissing || dependenciesMissing)(options.engine)) {
    run(npm[0], [...npm[1], 'install', '--no-audit', '--no-fund'], options.engine);
  }
  run(npm[0], [...npm[1], 'run', 'build'], options.engine);
  if (!fs.existsSync(cli)) throw new Error(`Build did not produce the CLI: ${cli}`);
  const files = [];
  if (options.client !== 'antigravity') {
    run(process.execPath, [cli, 'codex:setup', options.project], options.project);
    files.push(path.join(options.project, '.codex/config.toml'), path.join(options.project, 'AGENTS.md'), path.join(options.project, '.agents/skills/aegis/SKILL.md'));
    run(process.execPath, [path.join(options.engine, 'scripts/verify-codex-mcp.cjs'), options.project], options.engine);
  }
  if (options.client !== 'codex') files.push(...(injected.configureAntigravity || configureAntigravity)(options.engine, options.project));
  if (options.user) files.push(...(injected.configureUser || configureUser)(options, run, npm));
  for (const file of files) if (!fs.existsSync(file)) throw new Error(`Setup output missing: ${file}`);
  run(process.execPath, [cli, 'status'], options.project);
  log(`Aegis setup complete (${options.client}). Project: ${options.project}`);
  for (const file of files) log(`  ${file}`);
  const quoted = process.platform === 'win32' ? `'${cli.replace(/'/g, "''")}'` : `'${cli.replace(/'/g, `'"'"'`)}'`;
  log(`Fallback command: node ${quoted} <command>`);
  log('Reload the selected client and its MCP connection. For user commands, ensure the printed shim directory is on PATH; reopen your terminal if needed.');
}

if (require.main === module) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) console.log('npm run setup -- --client=codex|antigravity|both --project="<existing-project>" [--user] [--dry-run]');
    else runSetup(options);
  } catch (error) { console.error(`Aegis setup failed: ${error.message}`); process.exitCode = 1; }
}
module.exports = { parseOptions, runSetup, runChild, dependenciesMissing };
