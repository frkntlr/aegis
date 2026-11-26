import {
  GodotUiVerifier,
  GodotUiLinter,
  GodotUiScaffolder,
  type UiScaffoldType,
  type GodotUiNode,
  type GodotUiTreePayload
} from '@aegis/godot-bridge';
import { showBanner } from './banner.js';
import {
  resolveInspectAspectRatios,
  loadProjectTelemetryNodes,
  handleGodotUiPerf,
  handleGodotUiOptimize
} from './godot-helpers.js';

function hasTelemetry(nodeCount: number): boolean {
  if (nodeCount > 0) return true;
  console.error('UI Telemetry Verification unavailable: no usable telemetry nodes. Capture runtime telemetry before verification.');
  process.exitCode = 1;
  return false;
}

function verifyAspectRatio(verifier: GodotUiVerifier, ratio: string, nodes: GodotUiNode[]): boolean {
  const dims = GodotUiVerifier.ASPECT_DIMENSIONS[ratio] ?? { width: 1920, height: 1080 };
  const payload: GodotUiTreePayload = {
    viewport: { width: dims.width, height: dims.height, aspectRatio: ratio },
    nodes
  };
  const res = verifier.verifyPayload(payload);
  if (!res.passed) {
    console.log(` • Aspect [${ratio}] (${dims.width}x${dims.height}): ❌ FAIL (overlaps/clippings)`);
    for (const ov of res.overlaps.slice(0, 2)) console.log(`   - Overlap: "${ov.nodeA}" and "${ov.nodeB}"`);
    for (const cl of res.clippings.slice(0, 2)) console.log(`   - Clipping: "${cl.nodeId}" (${cl.reason})`);
    return false;
  }
  console.log(` • Aspect [${ratio}] (${dims.width}x${dims.height}): ✅ PASS`);
  if (res.undersizedTargets.length > 0) {
    const ut = res.undersizedTargets[0];
    console.log(`   ℹ️ Küçük Dokunma Hedefi: "${ut.nodeId}" (${ut.width}x${ut.height}px < ${ut.minRecommended}px)`);
  }
  return true;
}

export function handleGodotInspect(projectDirArg?: string): void {
  showBanner();
  const projectDir = projectDirArg || process.cwd();
  console.log(`📐 Running Zero-Token UI Telemetry Verification for: ${projectDir}...`);

  const verifier = new GodotUiVerifier();
  const ratios = resolveInspectAspectRatios(projectDir);
  const nodes = loadProjectTelemetryNodes(projectDir);
  if (!hasTelemetry(nodes.length)) return;
  console.log(` ℹ️ Loaded ${nodes.length} UI nodes from telemetry cache.`);
  console.log(`Checking ${ratios.length} target aspect ratios: ${ratios.join(', ')}`);

  let allPassed = true;
  for (const ratio of ratios) {
    if (!verifyAspectRatio(verifier, ratio, nodes)) allPassed = false;
  }

  if (allPassed) {
    console.log(`🎯 UI Telemetry Verification complete: All aspect ratios valid (${nodes.length} nodes verified).`);
  } else {
    console.error('🎯 UI Telemetry Verification FAILED: overlaps or clippings detected.');
    process.exitCode = 1;
  }
}

function runGodotUiScaffold(args: string[]): void {
  const type = (args[0] || 'menu') as UiScaffoldType;
  const name = args[1] || 'menu';
  const outDir = args[2] || process.cwd();
  const res = GodotUiScaffolder.scaffold(type, { name, outputDir: outDir });
  console.log(`🎨 Godot UI Scaffolding Complete: [${type.toUpperCase()}] "${res.name}"`);
  for (const f of res.filesWritten) console.log(` • Created: ${f}`);
}

function runGodotUiLint(target: string): void {
  const report = GodotUiLinter.lintScene(target);
  console.log(`🎨 Godot UI Scene Linter Report for: ${target}`);
  console.log(` • Score: ${report.score}/100 | Status: ${report.valid ? '✅ VALID' : '❌ ISSUES FOUND'} | Nodes: ${report.nodeCount}`);
  for (const iss of report.issues) {
    console.log(`   [${iss.severity.toUpperCase()}] ${iss.nodeName} (${iss.rule}): ${iss.message}`);
    console.log(`     💡 Fix: ${iss.fixSuggestion}`);
  }
}

const UI_ACTION_HANDLERS: Record<string, (args: string[]) => void> = {
  perf: args => handleGodotUiPerf(args[0]),
  audit: args => handleGodotUiPerf(args[0]),
  optimize: args => handleGodotUiOptimize(args[0]),
  fix: args => handleGodotUiOptimize(args[0]),
  scaffold: runGodotUiScaffold,
  create: runGodotUiScaffold
};

export function handleGodotUi(subcmd = 'lint', ...args: string[]): void {
  showBanner();
  const act = subcmd.toLowerCase();
  const actionHandler = UI_ACTION_HANDLERS[act];
  if (actionHandler) {
    actionHandler(args);
    return;
  }
  const target = args[0] || (subcmd.endsWith('.tscn') ? subcmd : process.cwd());
  if (target.endsWith('.tscn')) {
    runGodotUiLint(target);
    return;
  }
  if (act === 'lint') {
    console.log('❌ Usage: aegis godot ui:lint <scene.tscn>');
    return;
  }
  handleGodotInspect(target);
}
