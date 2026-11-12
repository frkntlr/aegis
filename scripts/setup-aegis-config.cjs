const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function writeChanged(file, content, mode) {
  const bytes = Buffer.from(content);
  let existing;
  try { existing = fs.lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return;
    const backup = `${file}.backup-${Date.now()}-${randomUUID()}`;
    if (existing.isSymbolicLink()) fs.renameSync(file, backup);
    else fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, mode ? { mode } : undefined);
}

function readObject(file) {
  if (!fs.existsSync(file)) return {};
  const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected JSON object: ${file}`);
  return value;
}

function requireObject(value, label) {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new Error(`Expected object for ${label}; existing configuration was preserved`);
  }
}

function configureAntigravity(engine, project) {
  const configFile = path.join(project, '.gemini/config/mcp_config.json');
  const settingsFile = path.join(project, '.gemini/settings.json');
  const config = readObject(configFile);
  const settings = readObject(settingsFile);
  requireObject(config.mcpServers, 'mcpServers');
  requireObject(config.mcpServers?.aegis, 'mcpServers.aegis');
  for (const field of ['files.exclude', 'search.exclude']) requireObject(settings[field], field);
  const skillSource = path.join(engine, 'templates/skills/aegis/SKILL.md');
  const skill = fs.readFileSync(skillSource, 'utf8');
  const server = { ...config.mcpServers?.aegis, command: process.execPath,
    args: [path.join(engine, 'packages/cli/dist/bin/aegis.js'), 'mcp'], cwd: project };
  for (const obsolete of ['url', 'bearer_token_env_var', 'http_headers', 'env_http_headers']) delete server[obsolete];
  config.mcpServers = { ...config.mcpServers, aegis: server };
  settings['files.exclude'] = { ...settings['files.exclude'], 'experimental/**': true };
  settings['search.exclude'] = { ...settings['search.exclude'], 'experimental/**': true };
  settings['antigravity.multiAgent'] = true;
  const plugin = path.join(project, '.gemini/config/plugins/aegis');
  const files = [configFile, settingsFile, path.join(plugin, 'plugin.json'), path.join(plugin, 'skills/aegis/SKILL.md')];
  writeChanged(configFile, JSON.stringify(config, null, 2));
  writeChanged(settingsFile, JSON.stringify(settings, null, 2));
  writeChanged(files[2], JSON.stringify({ name: 'aegis', version: '0.1.0' }, null, 2));
  writeChanged(files[3], skill);
  const rules = path.join(engine, 'GEMINI.md');
  if (fs.existsSync(rules)) {
    files.push(path.join(plugin, 'rules/AGENTS.md'));
    writeChanged(files.at(-1), fs.readFileSync(rules));
  }
  const runtime = path.join(project, '.aegis/installation.json');
  writeChanged(runtime, JSON.stringify({ engineRoot: engine, command: process.execPath,
    args: [path.join(engine, 'packages/cli/dist/bin/aegis.js')], cwd: project }, null, 2));
  files.push(runtime);
  return files;
}

function shellQuote(value) { return `'${value.replace(/'/g, `'"'"'`)}'`; }

function installUserShims(engine, prefix, platform = process.platform) {
  const bin = platform === 'win32' ? prefix : path.join(prefix, 'bin');
  const cli = path.join(engine, 'packages/cli/dist/bin/aegis.js');
  const files = [];
  for (const name of ['aegis', 'aegist', 'tw', 'tr', 'aegis-tw', 'aegist-tw', 'aegis-tr']) {
    const route = /(?:^|-)tw$/.test(name) ? 'tw' : /(?:^|-)tr$/.test(name) ? 'tr' : '';
    if (platform === 'win32') {
      const cmd = path.join(bin, `${name}.cmd`);
      const ps1 = path.join(bin, `${name}.ps1`);
      writeChanged(cmd, `@echo off\r\nsetlocal DisableDelayedExpansion\r\n"${process.execPath.replace(/%/g, '%%')}" "${cli.replace(/%/g, '%%')}" ${route ? route + ' ' : ''}%*\r\n`);
      writeChanged(ps1, `& '${process.execPath.replace(/'/g, "''")}' '${cli.replace(/'/g, "''")}' ${route ? `'${route}' ` : ''}@args\r\nexit $LASTEXITCODE\r\n`);
      files.push(cmd, ps1);
    } else {
      const file = path.join(bin, name);
      writeChanged(file, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(cli)} ${route ? route + ' ' : ''}"$@"\n`, 0o755);
      fs.chmodSync(file, 0o755);
      files.push(file);
    }
  }
  return files;
}

module.exports = { configureAntigravity, installUserShims, readObject };
