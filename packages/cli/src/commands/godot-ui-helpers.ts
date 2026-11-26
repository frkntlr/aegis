import * as path from 'node:path';
import * as fs from 'node:fs';
import { GodotUiPerfAuditor, GodotSceneSlicer } from '@aegis/godot-bridge';
import { showBanner } from './banner.js';

export interface GodotTreeCliOptions {
  scenePath?: string;
  focusNode?: string;
  maxDepth?: number;
  compact?: boolean;
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
