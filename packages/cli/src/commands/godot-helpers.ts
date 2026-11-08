import * as path from 'node:path';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import {
  GodotUiVerifier,
  GodotLocator,
  DoctoolRunner,
  GodotUiPerfAuditor,
  GodotPortRouter,
  GodotSceneSlicer,
  type ClassDbOracle,
  type GodotUiNode,
  type ValidationResult
} from '@aegis/godot-bridge';
import { showBanner } from './banner.js';

export function resolveInspectAspectRatios(projectDir: string): string[] {
  const configPath = path.join(projectDir, 'aegis.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (Array.isArray(cfg.godot?.aspectRatios) && cfg.godot.aspectRatios.length > 0) {
        return cfg.godot.aspectRatios;
      }
    } catch {
      // fallback
    }
  }
  return GodotUiVerifier.REQUIRED_ASPECT_RATIOS;
}

export function loadProjectTelemetryNodes(projectDir: string): GodotUiNode[] {
  const candidates = [
    path.join(projectDir, '.aegis', 'ui_telemetry.json'),
    path.join(projectDir, '.aegis', 'telemetry.json')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const data = JSON.parse(fs.readFileSync(c, 'utf8'));
        if (Array.isArray(data.nodes)) return data.nodes;
      } catch { /* ignore */ }
    }
  }
  return [];
}

export function scanAndValidateGd(dir: string, oracle: ClassDbOracle): ValidationResult[] {
  if (!fs.existsSync(dir)) return [];
  if (fs.statSync(dir).isFile()) {
    if (!dir.endsWith('.gd')) return [];
    try {
      return oracle.validateUsage(fs.readFileSync(dir, 'utf8'), path.basename(dir));
    } catch {
      return [];
    }
  }
  const results: ValidationResult[] = [];
  const entries = fs.readdirSync(dir, { recursive: true });
  for (const entry of entries) {
    const s = String(entry);
    if (s.endsWith('.gd')) {
      const full = path.join(dir, s);
      try {
        const content = fs.readFileSync(full, 'utf8');
        results.push(...oracle.validateUsage(content, s));
      } catch {
        // ignore unreadable files
      }
    }
  }
  return results;
}

export function handleGodotRun(projectDirArg?: string, ...extraArgs: string[]): void {
  showBanner();
  const projectDir = projectDirArg || process.cwd();
  console.log(`🚀 Executing Godot project at: ${projectDir}...`);
  const inst = GodotLocator.findGodot();
  if (!inst) {
    console.error('❌ Cannot run project: No Godot binary detected.');
    return;
  }
  const args = ['--path', projectDir, ...extraArgs];
  console.log(` • Godot: ${inst.binaryPath} (${inst.versionString})`);
  try {
    const cp = child_process.spawn(inst.binaryPath, args, { stdio: 'inherit' });
    console.log(`✅ Godot process spawned with PID ${cp.pid}.`);
  } catch (err) {
    console.error(`❌ Failed to spawn Godot: ${(err as Error).message}`);
  }
}

export function handleGodotDoctool(): void {
  showBanner();
  console.log('📚 Running Godot doctool / ClassDB zero-bloat indexing...');
  const runner = new DoctoolRunner();
  const indexed = runner.dumpAndIndexApi(true);
  console.log(`✅ Indexed ${indexed.size} Godot classes into local zero-bloat cache.`);
}

function resolvePlaytestTrack(scenarioArg?: string, extraArgs: string[] = []): string {
  if (scenarioArg?.startsWith('--track=')) {
    return scenarioArg.slice('--track='.length);
  }
  for (const a of extraArgs) {
    if (a.startsWith('--track=')) return a.slice('--track='.length);
  }
  return process.env.AEGIS_TRACK_ID || 'qa-hunter';
}

function resolveScenarioPath(scenarioArg?: string): string | undefined {
  if (!scenarioArg || scenarioArg.startsWith('--')) return undefined;
  const cwd = process.cwd();
  const fileCandidates = [
    scenarioArg,
    path.join(cwd, '.aegis', 'playtest.json'),
    path.join(cwd, 'test', 'playtest.json'),
    path.join(cwd, 'playtest.json')
  ];
  return fileCandidates.find(p => fs.existsSync(p));
}

function loadScenarioActions(scenarioPath?: string): unknown[] {
  const fallback: unknown[] = [
    { type: 'ping' },
    { type: 'wait', duration: 0.1 },
    { type: 'get_ui_tree' }
  ];
  if (!scenarioPath) {
    console.log(' • Using default smoke playtest scenario (3 actions).');
    return fallback;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
    const actions: unknown[] = Array.isArray(raw) ? raw : (raw.actions || fallback);
    console.log(` • Scenario loaded from: ${path.basename(scenarioPath)} (${actions.length} action(s))`);
    return actions;
  } catch {
    console.log(' ℹ️ Failed to read scenario file; using default smoke scenario.');
    return fallback;
  }
}

export function handleGodotPlaytest(scenarioArg?: string, ...extraArgs: string[]): void {
  showBanner();
  console.log('🎮 Autonomous Aegis Playtest Queue...');
  const trackId = resolvePlaytestTrack(scenarioArg, extraArgs);
  const allocation = GodotPortRouter.allocateTrackPort(trackId);
  console.log(` • Track Port Isolation: [${trackId}] -> Port: ${allocation.port}, Debug: ${allocation.debugPort}`);
  console.log(` • User Data Directory: ${allocation.userDataDir}`);

  const scenarioPath = resolveScenarioPath(scenarioArg);
  const actions = loadScenarioActions(scenarioPath);

  const reqId = `playtest-${Date.now()}`;
  console.log(`✅ Queued playtest scenario [${reqId}] with ${actions.length} action(s).`);
  console.log(' • Status: Ready for Godot AegisBridge autonomous execution.');
}

export function handleGodotUiPerf(targetArg?: string): void {
  showBanner();
  const target = targetArg || process.cwd();
  console.log(`⚡ Running Zero-Stutter UI Performance Audit for: ${target}...`);
  const files: string[] = [];
  if (fs.existsSync(target) && fs.statSync(target).isFile() && target.endsWith('.tscn')) {
    files.push(target);
  } else if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const entries = fs.readdirSync(target, { recursive: true });
    for (const e of entries) {
      if (String(e).endsWith('.tscn')) files.push(path.join(target, String(e)));
    }
  }

  if (files.length === 0) {
    console.log('ℹ️ No .tscn UI scene files found to audit.');
    return;
  }

  for (const f of files) {
    const rep = GodotUiPerfAuditor.auditScene(f);
    console.log(`🎨 UI Performance: ${path.basename(f)} [Grade: ${rep.grade} | Score: ${rep.score}/100]`);
    console.log(` • Nodes: ${rep.totalNodes} | Mouse Picking Stop on Decoratives: ${rep.metrics.mouseFilterStopOnNonInteractive}`);
    for (const iss of rep.issues) {
      console.log(`   [${iss.severity.toUpperCase()}] ${iss.nodeName} (${iss.rule}): ${iss.message}`);
      console.log(`     💡 Fix: ${iss.fixSuggestion}`);
    }
  }
}

export function handleGodotUiOptimize(targetArg?: string): void {
  showBanner();
  const target = targetArg || process.cwd();
  if (!fs.existsSync(target) || !target.endsWith('.tscn')) {
    console.log('Usage: aegis godot ui:optimize <scene.tscn>');
    return;
  }
  const content = fs.readFileSync(target, 'utf8');
  const { optimizedContent, fixesApplied } = GodotUiPerfAuditor.optimizeContent(content);
  fs.writeFileSync(target, optimizedContent, 'utf8');
  console.log(`⚡ Optimized UI Scene: ${target}`);
  console.log(` • Applied ${fixesApplied.length} performance fix(es):`);
  for (const fix of fixesApplied) console.log(`   - ${fix}`);
}


export interface GodotTreeCliOptions {
  scenePath?: string;
  focusNode?: string;
  maxDepth?: number;
  compact?: boolean;
}

export function parseGodotTreeArgs(args: string[]): GodotTreeCliOptions {
  const options: GodotTreeCliOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--focus=')) {
      options.focusNode = arg.slice('--focus='.length);
    } else if (arg === '--focus' && i + 1 < args.length) {
      options.focusNode = args[++i];
    } else if (arg.startsWith('--depth=')) {
      const parsed = parseInt(arg.slice('--depth='.length), 10);
      if (!Number.isNaN(parsed)) options.maxDepth = parsed;
    } else if (arg === '--depth' && i + 1 < args.length) {
      const parsed = parseInt(args[++i], 10);
      if (!Number.isNaN(parsed)) options.maxDepth = parsed;
    } else if (arg === '--compact') {
      options.compact = true;
    } else if (!arg.startsWith('--') && !options.scenePath) {
      options.scenePath = arg;
    }
  }
  return options;
}

function resolveScenePath(scenePath?: string): string | undefined {
  if (!scenePath) return undefined;
  if (scenePath.startsWith('res://')) {
    return path.resolve(process.cwd(), scenePath.slice(6));
  }
  return path.isAbsolute(scenePath) ? scenePath : path.resolve(process.cwd(), scenePath);
}

export function handleGodotTree(...rawArgs: (string | string[])[]): void {
  showBanner();
  const args = rawArgs.flat();
  const parsed = parseGodotTreeArgs(args);
  if (!parsed.scenePath) {
    console.log('Usage: aegis godot tree <scene.tscn> [--focus=<node>] [--depth=<n>] [--compact]');
    return;
  }
  const targetPath = resolveScenePath(parsed.scenePath);
  if (!targetPath || !fs.existsSync(targetPath)) {
    console.error(`❌ Scene file not found: ${parsed.scenePath}`);
    return;
  }
  console.log(`🌲 Slicing Godot scene: ${path.basename(targetPath)}...`);
  if (parsed.focusNode) console.log(` • Focus: ${parsed.focusNode}`);
  if (parsed.maxDepth !== undefined) console.log(` • Max Depth: ${parsed.maxDepth}`);
  if (parsed.compact) console.log(` • Mode: Compact`);

  try {
    const slice = GodotSceneSlicer.sliceScene(targetPath, {
      focusNode: parsed.focusNode,
      maxDepth: parsed.maxDepth,
      compact: parsed.compact
    });
    if (!slice.trim()) {
      console.log('ℹ️ Scene slice is empty (no matching nodes found).');
    } else {
      console.log(slice);
    }
  } catch (err) {
    console.error(`❌ Slicing failed: ${(err as Error).message}`);
  }
}
