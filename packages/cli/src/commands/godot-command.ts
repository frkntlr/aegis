import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  GodotInitWorkflow,
  GodotLocator,
  ClassDbOracle,
  GodotTestRunner
} from '@aegis/godot-bridge';
import { debugLogIgnored, readJsonSafe } from '@aegis/shared';
import { showBanner } from './banner.js';
import {
  scanAndValidateGd,
  handleGodotRun,
  handleGodotDoctool,
  handleGodotPlaytest,
  handleGodotTree
} from './godot-helpers.js';
import { handleGodotInspect, handleGodotUi } from './godot-ui-commands.js';

export { handleGodotRun, handleGodotDoctool, handleGodotPlaytest, handleGodotTree };
export { handleGodotInspect, handleGodotUi };

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
      const cfg = readJsonSafe<{ godot?: { bridgePort?: number; aspectRatios?: string[] } }>(configPath);
      if (cfg.godot) {
        console.log(`⚙️  Active Godot Config:`);
        console.log(` • Bridge Port: ${cfg.godot.bridgePort ?? 6850}`);
        console.log(` • Aspect Ratios: ${(cfg.godot.aspectRatios || []).join(', ')}`);
      }
    } catch (err: unknown) {
      debugLogIgnored('godot-command:status', err);
    }
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

const GODOT_SUBCOMMANDS: Record<string, (args: string[]) => void | Promise<void>> = {
  init: args => handleGodotInit(args[1], args[2]),
  inspect: args => handleGodotInspect(args[1]),
  status: () => handleGodotStatus(),
  query: args => handleGodotQuery(args[1]),
  doctool: () => handleGodotDoctool(),
  validate: args => handleGodotValidate(args[1]),
  run: args => handleGodotRun(args[1], ...args.slice(2)),
  playtest: args => handleGodotPlaytest(args[1], ...args.slice(2)),
  tree: args => handleGodotTree(...args.slice(1)),
  test: args => handleGodotTest(args[1], args[2])
};

export async function handleGodot(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  if (subcommand === 'ui' || subcommand.startsWith('ui:')) {
    const sub = subcommand.includes(':') ? subcommand.split(':')[1] : args[1];
    const subArgs = subcommand.includes(':') ? args.slice(1) : args.slice(2);
    handleGodotUi(sub, ...subArgs);
    return;
  }
  const handler = GODOT_SUBCOMMANDS[subcommand];
  if (handler) {
    await handler(args);
    return;
  }
  console.log(`Unknown godot subcommand: '${subcommand}'. Usage: aegis godot [init|ui|status|inspect|query|doctool|validate|run|playtest|tree]`);
}
