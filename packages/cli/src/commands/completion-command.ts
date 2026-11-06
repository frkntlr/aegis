/**
 * @file completion-command.ts
 * Autocompletion script generator and installer for PowerShell and Bash.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { showBanner } from './banner.js';

export const ALL_AEGIS_COMMANDS: readonly string[] = [
  'tw', 'tw:plan', 'tw:status', 'tw:compact', 'tw:clear', 'tw:dag', 'tw:matrix', 'tw:analyze', 'tw:setup', 'tw:mesh', 'tw:peers', 'tw:post', 'tw:broadcast', 'tw:waves', 'tw:radar', 'tw:conflicts', 'tw:scale', 'tw:batch', 'tw:doc', 'tw:synthesize', 'tw:advance',
  'teamwork', 'teamwork:status', 'teamwork:plan', 'teamwork:compact', 'teamwork:clear', 'teamwork:dag', 'teamwork:matrix', 'teamwork:analyze', 'teamwork:setup', 'teamwork:mesh', 'teamwork:peers', 'teamwork:post', 'teamwork:broadcast', 'teamwork:waves', 'teamwork:radar', 'teamwork:conflicts', 'teamwork:scale', 'teamwork:batch', 'teamwork:doc', 'teamwork:synthesize', 'teamwork:advance',
  'init', 'status', 'auto', 'prompt', 'contribute',
  'rfc', 'rfc:triage', 'rfc:create', 'rfc:approve', 'rfc:decompose', 'ideate',
  'nlm:sync', 'nlm:query', 'nlm:research', 'nlm:sources', 'nlm:poll', 'nlm:import', 'nlm:prune', 'nlm:restore', 'nlm:auth', 'nlm:switch', 'switch',
  'task:list', 'task:claim', 'task:release', 'task:inject', 'task:pull', 'task:clear', 'task:reset', 'task:verify', 'verify:task',
  'lock:status', 'lock:clear', 'lock:reset',
  'cage:check', 'skeleton', 'skeleton:scan', 'diff', 'inspect', 'mutate', 'audit', 'estimate', 'verify',
  'find', 'triage', 'trace', 'graph:scan', 'ast:search', 'ast-grep', 'sg', 'ast:replace', 'rtk:compress', 'context7:query',
  'memory:query', 'memory:stats', 'memory:cold-start', 'memory:refresh', 'memory:prune', 'memory:verify', 'memory:watch',
  'godot', 'godot:init', 'godot:status', 'godot:inspect', 'godot:validate', 'godot:query', 'godot:run', 'godot:doctool', 'godot:playtest', 'godot:test', 'godot:ui', 'godot:ui:lint', 'godot:ui:scaffold',
  'gh:status', 'gh:sync', 'gh:comment', 'gh:pr', 'gh:locate',
  'project:list', 'project:sync', 'wiki:list', 'wiki:show', 'wiki:clean', 'wiki:seed', 'wiki:sync', 'wiki:status',
  'merge', 'branch:sync', 'deps:drift', 'deps:sync', 'dashboard', 'ide:list', 'ide:sync',
  'debug', 'loop:status', 'loop:reset', 'mcp', 'mcp:start', 'completion', 'search', 'help', 'version'
];

export function generatePowerShellCompletion(commands = ALL_AEGIS_COMMANDS): string {
  const cmdsList = commands.map(c => `'${c}'`).join(', ');
  return [
    '# Aegis PowerShell Tab Completion Block',
    `$script:aegisCommands = @(${cmdsList})`,
    "Register-ArgumentCompleter -Native -CommandName 'aegis', 'aegis.ps1' -ScriptBlock {",
    '    param($wordToComplete, $commandAst, $cursorPosition)',
    '    $script:aegisCommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {',
    "        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    '    }',
    '}'
  ].join('\r\n');
}

export function generateBashCompletion(commands = ALL_AEGIS_COMMANDS): string {
  const words = commands.join(' ');
  const curVar = '$' + '{COMP_WORDS[COMP_CWORD]}';
  const wordsVar = '$' + '{words}';
  const curExpand = '$' + '{cur}';
  return [
    '# Aegis Bash Tab Completion',
    '_aegis_completions() {',
    `    local cur="${curVar}"`,
    `    local words="${words}"`,
    `    COMPREPLY=($(compgen -W "${wordsVar}" -- "${curExpand}"))`,
    '}',
    'complete -F _aegis_completions aegis'
  ].join('\n');
}

function resolvePowerShellProfilePath(): string | null {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  return path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1');
}

export function installToProfile(customPath?: string): boolean {
  const profilePath = customPath || resolvePowerShellProfilePath();
  if (!profilePath) return false;
  try {
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    const content = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf8') : '';
    if (content.includes('Register-ArgumentCompleter') && content.includes('aegisCommands')) {
      return true; // Already installed
    }
    const script = '\r\n\r\n' + generatePowerShellCompletion() + '\r\n';
    fs.appendFileSync(profilePath, script, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function resolveAntigravityBinPath(): string | null {
  const candidates = [
    'C:\\Users\\Lenovo\\AntigravityProfiles\\client-a\\.gemini\\antigravity\\bin\\aegis.ps1',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.gemini', 'antigravity', 'bin', 'aegis.ps1') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AntigravityProfiles', 'client-a', '.gemini', 'antigravity', 'bin', 'aegis.ps1') : null
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function installToBinScript(customPath?: string): boolean {
  const binPath = customPath || resolveAntigravityBinPath();
  if (!binPath || !fs.existsSync(binPath)) return false;
  try {
    const existing = fs.readFileSync(binPath, 'utf8');
    if (existing.includes('Register-ArgumentCompleter')) return true;
    const injected = generatePowerShellCompletion() + '\r\n\r\n' + existing;
    fs.writeFileSync(binPath, injected, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function runInstall(): void {
  showBanner();
  console.log('⚡ Installing Aegis Tab Autocompletion...\n');
  const profileOk = installToProfile();
  const profilePath = resolvePowerShellProfilePath();
  if (profileOk) {
    console.log(` ✅ PowerShell Profile updated: ${profilePath}`);
  } else {
    console.log(` ⚠️  Could not write to PowerShell Profile.`);
  }

  const binOk = installToBinScript();
  if (binOk) {
    console.log(` ✅ Injected into Antigravity bin launcher (aegis.ps1).`);
  }

  console.log('\n🎉 Autocompletion installed! Restart your shell or run:');
  console.log(`   . "${profilePath || '$PROFILE'}"`);
}

export function handleCompletion(shellOrFlag?: string, ...args: string[]): void {
  const all = [shellOrFlag, ...args].filter(Boolean) as string[];
  const isInstall = all.some(a => a === '--install' || a === '-i');

  if (isInstall) {
    runInstall();
    return;
  }

  const shell = (all.find(a => !a.startsWith('-')) || (process.platform === 'win32' ? 'powershell' : 'bash')).toLowerCase();
  if (shell.includes('bash') || shell.includes('zsh')) {
    console.log(generateBashCompletion());
    return;
  }

  console.log(generatePowerShellCompletion());
}
