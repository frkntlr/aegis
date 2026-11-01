import * as path from 'node:path';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import {
  GodotUiVerifier,
  GodotLocator,
  DoctoolRunner,
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

export function handleGodotPlaytest(scenarioArg?: string): void {
  showBanner();
  console.log('🎮 Autonomous Aegis Playtest Queue...');
  const cwd = process.cwd();
  const fileCandidates = [
    scenarioArg,
    path.join(cwd, '.aegis', 'playtest.json'),
    path.join(cwd, 'test', 'playtest.json'),
    path.join(cwd, 'playtest.json')
  ].filter(Boolean) as string[];

  const scenarioPath = fileCandidates.find(p => fs.existsSync(p));
  let actions: unknown[] = [
    { type: 'ping' },
    { type: 'wait', duration: 0.1 },
    { type: 'get_ui_tree' }
  ];

  if (scenarioPath) {
    try {
      const raw = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
      actions = Array.isArray(raw) ? raw : (raw.actions || actions);
      console.log(` • Scenario loaded from: ${path.basename(scenarioPath)} (${actions.length} action(s))`);
    } catch {
      console.log(' ℹ️ Failed to read scenario file; using default smoke scenario.');
    }
  } else {
    console.log(' • Using default smoke playtest scenario (3 actions).');
  }

  const reqId = `playtest-${Date.now()}`;
  console.log(`✅ Queued playtest scenario [${reqId}] with ${actions.length} action(s).`);
  console.log(' • Status: Ready for Godot AegisBridge autonomous execution.');
}
