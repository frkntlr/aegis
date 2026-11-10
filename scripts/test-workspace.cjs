// Each Node test worker gets disposable Aegis state, including suites without fixtures.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempRoot = path.resolve(os.tmpdir());
const workspace = fs.mkdtempSync(path.join(tempRoot, 'aegis-test-worker-'));
fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({
  name: 'aegis-test-fixture', private: true, scripts: { test: 'node --test smoke.test.cjs' }
}));
fs.writeFileSync(path.join(workspace, 'smoke.test.cjs'),
  "require('node:test')('fixture assertion', () => require('node:assert/strict').equal(2 + 2, 4));\n");
process.env.AEGIS_WORKSPACE = workspace;
process.env.AEGIS_INBOX_PATH = path.join(workspace, '.aegis/task-inbox.json');
process.on('exit', () => {
  if (path.dirname(workspace) !== tempRoot) return;
  try { fs.rmSync(workspace, { recursive: true, force: true }); } catch { /* best-effort test cleanup */ }
});
