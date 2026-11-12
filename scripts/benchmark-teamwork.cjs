// Local, disposable benchmark. Build first; no model/API calls or project writes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { TeamworkCoordinator } = require('../packages/core/orchestrator/dist/index.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-tw-benchmark-'));
const files = Array.from({ length: 24 }, (_, i) => `src/domain${i}.ts`);
function median(values) { return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]; }
function fixture() {
  fs.mkdirSync(path.join(root, 'src'));
  for (const [i, file] of files.entries()) {
    const methods = Array.from({ length: 18 }, (_, n) => `export function operation${i}_${n}(value: number): number { return value + ${n}; }`);
    fs.writeFileSync(path.join(root, file), methods.join('\n'));
  }
}
function measure() {
  const coordinator = new TeamworkCoordinator({ repoRoot: root, bootstrap: false });
  const samples = [];
  let plan;
  for (let i = 0; i < 16; i++) {
    const start = performance.now();
    plan = coordinator.planTeamwork('Implement domain operations and verify contracts', files,
      { stage: false, acquireLocks: false, deterministic: true });
    if (i > 0) samples.push(performance.now() - start);
  }
  return { files: files.length, tracks: plan.tracks.length, samples: samples.length,
    medianPlanMs: Number(median(samples).toFixed(3)),
    antigravityPromptBytes: plan.tracks.reduce((n, t) => n + Buffer.byteLength(t.invocationPayload.Prompt), 0),
    codexMessageBytes: plan.tracks.reduce((n, t) => n + Buffer.byteLength(t.codexInvocationPayload.message), 0),
    serializedPlanBytes: Buffer.byteLength(JSON.stringify(plan)) };
}
try { fixture(); console.log(JSON.stringify(measure(), null, 2)); }
finally { fs.rmSync(root, { recursive: true, force: true }); }
