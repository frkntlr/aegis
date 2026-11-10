const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

// Explicit user-level install: does not alter project instructions or MCP roots.
const engine = path.resolve(__dirname, '..');
const userHome = path.resolve(process.argv[2] || os.homedir());
const codexHome = process.argv[2]
  ? path.join(userHome, '.codex')
  : path.resolve(process.env.CODEX_HOME || path.join(userHome, '.codex'));
const source = path.join(engine, 'templates/codex');
const entries = [
  ['skills/aegis/SKILL.md', path.join(userHome, '.agents/skills/aegis/SKILL.md')],
  ['skills/aegis/agents/openai.yaml', path.join(userHome, '.agents/skills/aegis/agents/openai.yaml')],
  ['prompts/aegis.md', path.join(codexHome, 'prompts/aegis.md')],
  ['prompts/aegist.md', path.join(codexHome, 'prompts/aegist.md')]
];

// Validate every input before modifying a user's installation.
const files = entries.map(([relative, destination]) => [destination, fs.readFileSync(path.join(source, relative))]);
const instructions = path.join(codexHome, 'AGENTS.md');
const existing = fs.existsSync(instructions) ? fs.readFileSync(instructions, 'utf8') : '';
files.push([instructions, Buffer.from(mergeInstructions(existing), 'utf8')]);
for (const [destination, content] of files) writeChanged(destination, content);
console.log('Reload Codex. Submit aegis tw <objective>, or select $aegis / /skills. Composer submenus are not installed.');

function writeChanged(destination, content) {
  if (fs.existsSync(destination)) {
    if (fs.readFileSync(destination).equals(content)) return;
    fs.copyFileSync(destination, `${destination}.backup-${Date.now()}-${randomUUID()}`, fs.constants.COPYFILE_EXCL);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
  console.log(`Installed ${destination}`);
}

function mergeInstructions(text) {
  const start = '<!-- aegis:user:start -->';
  const end = '<!-- aegis:user:end -->';
  const starts = text.split(start).length - 1;
  const ends = text.split(end).length - 1;
  if (starts !== ends || starts > 1 || (starts === 1 && text.indexOf(start) > text.indexOf(end))) {
    throw new Error(`Invalid Aegis managed markers in ${instructions}; repair the block before installing.`);
  }
  const block = `${start}\n${fs.readFileSync(path.join(source, 'user-AGENTS.md'), 'utf8').trim()}\n${end}`;
  return starts === 1
    ? text.replace(/<!-- aegis:user:start -->[\s\S]*?<!-- aegis:user:end -->/, () => block)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${block}\n`;
}
