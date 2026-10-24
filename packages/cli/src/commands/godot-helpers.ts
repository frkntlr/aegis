import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  GodotUiVerifier,
  type ClassDbOracle,
  type GodotUiNode,
  type ValidationResult
} from '@aegis/godot-bridge';

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
