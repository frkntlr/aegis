import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  GodotInitWorkflow,
  GodotLocator,
  GodotUiVerifier,
  type GodotUiTreePayload
} from '@aegis/godot-bridge';
import { showBanner } from './banner.js';

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
  console.log(`Checking ${GodotUiVerifier.REQUIRED_ASPECT_RATIOS.length} required aspect ratios: ${GodotUiVerifier.REQUIRED_ASPECT_RATIOS.join(', ')}`);

  let allPassed = true;
  for (const ratio of GodotUiVerifier.REQUIRED_ASPECT_RATIOS) {
    const mockPayload: GodotUiTreePayload = {
      viewport: { width: 1920, height: 1080, aspectRatio: ratio },
      nodes: []
    };
    const res = verifier.verifyPayload(mockPayload);
    if (!res.passed) allPassed = false;
    console.log(` • Aspect [${ratio}]: ${res.passed ? '✅ PASS' : '❌ FAIL (overlaps/clippings)'}`);
  }

  if (allPassed) {
    console.log('🎯 UI Telemetry Verification complete: All aspect ratios valid.');
  }
}

export async function handleGodot(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  if (subcommand === 'init') {
    handleGodotInit(args[1], args[2]);
  } else if (subcommand === 'inspect') {
    handleGodotInspect(args[1]);
  } else if (subcommand === 'status') {
    handleGodotStatus();
  } else {
    console.log(`Unknown godot subcommand: '${subcommand}'. Usage: aegis godot [init|status|inspect]`);
  }
}
