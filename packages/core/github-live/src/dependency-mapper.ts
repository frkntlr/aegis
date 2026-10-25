import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiscoveredDependency {
  name: string;
  version: string;
  ecosystem: 'npm' | 'godot';
  source: string;
}

export class DependencyMapper {
  public static scanPackageJson(targetPath: string): DiscoveredDependency[] {
    const filePath = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
      ? path.join(targetPath, 'package.json')
      : targetPath;

    if (!fs.existsSync(filePath)) return [];

    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
      const deps: DiscoveredDependency[] = [];
      const sections = ['dependencies', 'devDependencies', 'peerDependencies'];

      for (const sec of sections) {
        const group = content[sec] as Record<string, string> | undefined;
        if (group && typeof group === 'object') {
          for (const [name, version] of Object.entries(group)) {
            deps.push({ name, version, ecosystem: 'npm', source: filePath });
          }
        }
      }
      return deps;
    } catch {
      return [];
    }
  }

  public static scanGodotProject(targetDir: string): DiscoveredDependency[] {
    const deps: DiscoveredDependency[] = [];
    const projectGodotPath = path.join(targetDir, 'project.godot');

    if (fs.existsSync(projectGodotPath)) {
      try {
        const content = fs.readFileSync(projectGodotPath, 'utf8');
        const vMatch = content.match(/config\/features=PackedStringArray\([^)]*"([0-9.]+)"/);
        deps.push({
          name: 'godot',
          version: vMatch ? vMatch[1] : '4.x',
          ecosystem: 'godot',
          source: projectGodotPath
        });
      } catch { /* ignore non-fatal read errors */ }
    }

    DependencyMapper.scanGodotAddons(targetDir, deps);
    return deps;
  }

  private static scanGodotAddons(targetDir: string, deps: DiscoveredDependency[]): void {
    const addonsDir = path.join(targetDir, 'addons');
    if (!fs.existsSync(addonsDir) || !fs.statSync(addonsDir).isDirectory()) return;

    try {
      const entries = fs.readdirSync(addonsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginCfg = path.join(addonsDir, entry.name, 'plugin.cfg');
        let version = '1.0.0';
        if (fs.existsSync(pluginCfg)) {
          const cfgText = fs.readFileSync(pluginCfg, 'utf8');
          const m = cfgText.match(/version=["']([^"']+)["']/);
          if (m) version = m[1];
        }
        deps.push({ name: entry.name, version, ecosystem: 'godot', source: pluginCfg });
      }
    } catch { /* ignore non-fatal read errors */ }
  }

  public static scanWorkspace(rootDir: string): DiscoveredDependency[] {
    const npmDeps = DependencyMapper.scanPackageJson(rootDir);
    const godotDeps = DependencyMapper.scanGodotProject(rootDir);
    return [...npmDeps, ...godotDeps];
  }
}
