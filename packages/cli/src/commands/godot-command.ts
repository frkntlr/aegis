import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  GodotInitWorkflow,
  GodotLocator,
  GodotUiVerifier,
  GodotUiLinter,
  GodotUiScaffolder,
  type UiScaffoldType,
  ClassDbOracle,
  GodotTestRunner,
  type GodotUiTreePayload
} from '@aegis/godot-bridge';
import { showBanner } from './banner.js';
import {
  resolveInspectAspectRatios,
  loadProjectTelemetryNodes,
  scanAndValidateGd,
  handleGodotRun,
  handleGodotDoctool,
  handleGodotPlaytest,
  handleGodotUiPerf,
  handleGodotUiOptimize,
  handleGodotTree
} from './godot-helpers.js';

export { handleGodotRun, handleGodotDoctool, handleGodotPlaytest, handleGodotTree };

export function handleGodotInit(projectDirArg?: string, portArg?: string): void {
  showBanner();
  const projectDir = projectDirArg || process.cwd();
  const port = portArg ? parseInt(portArg, 10) : 6850;

  console.log(`🎮 Initializing Aegis Godot Bridge for project at: ${projectDir}...`);
  const result = GodotInitWorkflow.initProject({
    projectDir,
    bridgePort: port
  });

  if (result.success) {
    console.log(`✅ ${result.message}`);
    if (result.installation) {
      console.log(` • Godot Engine: ${result.installation.versionString} (${result.installation.binaryPath})`);
    } else {
      console.log(' ℹ️  Godot binary not auto-detected; you can set "binaryPath" in aegis.config.json.');
    }
    console.log(` • Bridge Port: ${port}`);
    console.log(` • Installed Addon Files: ${result.installedAddonFiles.length}`);
  } else {
    console.error(`❌ Initialization failed: ${result.message}`);
  }
}

export function handleGodotStatus(): void {
  showBanner();
  console.log('🔍 Inspecting Godot environment and active configuration...');
  const install = GodotLocator.findGodot();

  if (install) {
    console.log(`✅ Godot Detected: ${install.versionString}`);
    console.log(` • Path: ${install.binaryPath}`);
    console.log(` • Major Version: Godot ${install.majorVersion}.x`);
    console.log(` • Headless Capable: ${install.isHeadlessCapable ? 'Yes' : 'No'}`);
  } else {
    console.log('⚠️  No local Godot installation detected in standard paths or PATH.');
  }

  const configPath = path.join(process.cwd(), 'aegis.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.godot) {
        console.log(`⚙️  Active Godot Config:`);
        console.log(` • Bridge Port: ${cfg.godot.bridgePort ?? 6850}`);
        console.log(` • Aspect Ratios: ${(cfg.godot.aspectRatios || []).join(', ')}`);
      }
    } catch {
      // ignore
    }
  }
}

export function handleGodotInspect(projectDirArg?: string): void {
  showBanner();
  const projectDir = projectDirArg || process.cwd();
  console.log(`📐 Running Zero-Token UI Telemetry Verification for: ${projectDir}...`);

  const verifier = new GodotUiVerifier();
  const ratios = resolveInspectAspectRatios(projectDir);
  const nodes = loadProjectTelemetryNodes(projectDir);
  if (nodes.length > 0) {
    console.log(` ℹ️ Loaded ${nodes.length} UI nodes from telemetry cache.`);
  }
  console.log(`Checking ${ratios.length} target aspect ratios: ${ratios.join(', ')}`);

  let allPassed = true;
  for (const ratio of ratios) {
    const dims = GodotUiVerifier.ASPECT_DIMENSIONS[ratio] ?? { width: 1920, height: 1080 };
    const payload: GodotUiTreePayload = {
      viewport: { width: dims.width, height: dims.height, aspectRatio: ratio },
      nodes
    };
    const res = verifier.verifyPayload(payload);
    if (!res.passed) {
      allPassed = false;
      console.log(` • Aspect [${ratio}] (${dims.width}x${dims.height}): ❌ FAIL (overlaps/clippings)`);
      for (const ov of res.overlaps.slice(0, 2)) console.log(`   - Overlap: "${ov.nodeA}" and "${ov.nodeB}"`);
      for (const cl of res.clippings.slice(0, 2)) console.log(`   - Clipping: "${cl.nodeId}" (${cl.reason})`);
    } else {
      console.log(` • Aspect [${ratio}] (${dims.width}x${dims.height}): ✅ PASS`);
      if (res.undersizedTargets.length > 0) {
        const ut = res.undersizedTargets[0];
        console.log(`   ℹ️ Küçük Dokunma Hedefi: "${ut.nodeId}" (${ut.width}x${ut.height}px < ${ut.minRecommended}px)`);
      }
    }
  }

  if (allPassed) {
    console.log(`🎯 UI Telemetry Verification complete: All aspect ratios valid${nodes.length > 0 ? ` (${nodes.length} nodes verified)` : ''}.`);
  }
}

export function handleGodotQuery(className?: string): void {
  showBanner();
  if (!className) {
    console.log('Usage: aegis godot query <ClassName>');
    return;
  }
  const oracle = new ClassDbOracle();
  const info = oracle.queryClass(className);
  if (info) {
    console.log(`🏛️ Class: ${info.name}${info.inherits ? ` (inherits: ${info.inherits})` : ''}`);
    console.log(` • Methods (${info.methods.length}): ${info.methods.slice(0, 5).map(m => m.name).join(', ')}${info.methods.length > 5 ? '...' : ''}`);
    console.log(` • Properties (${info.properties.length}): ${info.properties.slice(0, 5).map(p => p.name).join(', ')}${info.properties.length > 5 ? '...' : ''}`);
    console.log(` • Signals (${info.signals.length}): ${info.signals.slice(0, 5).map(s => s.name).join(', ')}${info.signals.length > 5 ? '...' : ''}`);
  } else {
    console.log(`❌ Class '${className}' not found in ClassDB.`);
    const matches = oracle.searchClasses(className, 5);
    if (matches.length > 0) {
      console.log(`💡 Did you mean: ${matches.map(m => m.name).join(', ')}?`);
    }
  }
}

export function handleGodotValidate(targetDir?: string): void {
  showBanner();
  const dir = targetDir || process.cwd();
  console.log(`🔍 Validating GDScript base usage in: ${dir}...`);
  const oracle = new ClassDbOracle();
  const violations = scanAndValidateGd(dir, oracle);
  if (violations.length === 0) {
    console.log('✅ 100% CLEAN: All GDScript method calls are valid in ClassDB.');
  } else {
    console.log(`⚠️ Found ${violations.length} validation issue(s):`);
    for (const v of violations.slice(0, 10)) {
      console.log(` • [${v.severity.toUpperCase()}] ${v.file}:${v.line} - ${v.message}`);
    }
  }
}

export async function handleGodotTest(projectDirArg?: string, scenarioArg?: string): Promise<void> {
  showBanner();
  const dir = projectDirArg || process.cwd();
  console.log(`🎮 Executing Headless Godot Substrate 3.0 Test Harness for: ${dir}...`);
  const res = await GodotTestRunner.runPlaytestScenario(dir, scenarioArg);
  if (res.passed) {
    console.log(`✅ Headless Godot Test PASSED in ${res.durationMs}ms`);
  } else {
    console.error(`❌ Headless Godot Test FAILED in ${res.durationMs}ms (exit code: ${res.exitCode})`);
    if (res.stderr) console.error(res.stderr);
  }
}

export function handleGodotUi(subcmd = 'lint', ...args: string[]): void {
  showBanner();
  const act = subcmd.toLowerCase();
  if (act === 'perf' || act === 'audit') {
    handleGodotUiPerf(args[0]);
    return;
  }
  if (act === 'optimize' || act === 'fix') {
    handleGodotUiOptimize(args[0]);
    return;
  }
  if (act === 'scaffold' || act === 'create') {
    const type = (args[0] || 'menu') as UiScaffoldType;
    const name = args[1] || 'menu';
    const outDir = args[2] || process.cwd();
    const res = GodotUiScaffolder.scaffold(type, { name, outputDir: outDir });
    console.log(`🎨 Godot UI Scaffolding Complete: [${type.toUpperCase()}] "${res.name}"`);
    for (const f of res.filesWritten) console.log(` • Created: ${f}`);
    return;
  }
  const target = args[0] || (subcmd.endsWith('.tscn') ? subcmd : process.cwd());
  if (target.endsWith('.tscn')) {
    const report = GodotUiLinter.lintScene(target);
    console.log(`🎨 Godot UI Scene Linter Report for: ${target}`);
    console.log(` • Score: ${report.score}/100 | Status: ${report.valid ? '✅ VALID' : '❌ ISSUES FOUND'} | Nodes: ${report.nodeCount}`);
    for (const iss of report.issues) {
      console.log(`   [${iss.severity.toUpperCase()}] ${iss.nodeName} (${iss.rule}): ${iss.message}`);
      console.log(`     💡 Fix: ${iss.fixSuggestion}`);
    }
    return;
  }
  if (act === 'lint') {
    console.log('❌ Usage: aegis godot ui:lint <scene.tscn>');
    return;
  }
  handleGodotInspect(target);
}

export async function handleGodot(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  if (subcommand === 'init') {
    handleGodotInit(args[1], args[2]);
  } else if (subcommand === 'ui' || subcommand.startsWith('ui:')) {
    const sub = subcommand.includes(':') ? subcommand.split(':')[1] : args[1];
    const subArgs = subcommand.includes(':') ? args.slice(1) : args.slice(2);
    handleGodotUi(sub, ...subArgs);
  } else if (subcommand === 'inspect') {
    handleGodotInspect(args[1]);
  } else if (subcommand === 'status') {
    handleGodotStatus();
  } else if (subcommand === 'query') {
    handleGodotQuery(args[1]);
  } else if (subcommand === 'doctool') {
    handleGodotDoctool();
  } else if (subcommand === 'validate') {
    handleGodotValidate(args[1]);
  } else if (subcommand === 'run') {
    handleGodotRun(args[1], ...args.slice(2));
  } else if (subcommand === 'playtest') {
    handleGodotPlaytest(args[1], ...args.slice(2));
  } else if (subcommand === 'tree') {
    handleGodotTree(...args.slice(1));
  } else if (subcommand === 'test') {
    await handleGodotTest(args[1], args[2]);
  } else {
    console.log(`Unknown godot subcommand: '${subcommand}'. Usage: aegis godot [init|ui|status|inspect|query|doctool|validate|run|playtest|tree]`);
  }
}

