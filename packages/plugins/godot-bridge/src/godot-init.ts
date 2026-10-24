import * as fs from 'node:fs';
import * as path from 'node:path';
import { GodotLocator, type GodotInstallation } from './godot-locator.js';

export interface GodotInitOptions {
  projectDir: string;
  godotBinary?: string;
  bridgePort?: number;
}

export interface GodotInitResult {
  success: boolean;
  message: string;
  installation?: GodotInstallation;
  installedAddonFiles: string[];
}

export class GodotInitWorkflow {
  public static initProject(options: GodotInitOptions): GodotInitResult {
    const projectDir = path.resolve(options.projectDir);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const installation = GodotLocator.findGodot(options.godotBinary);
    this.ensureProjectGodotFile(projectDir);
    const installedFiles = this.copyAddonFiles(projectDir);
    this.enablePluginInProjectGodot(projectDir, installation?.majorVersion ?? 4);
    this.ensureAegisConfigFile(projectDir, options.bridgePort ?? 6850, installation?.binaryPath);

    return {
      success: true,
      message: `Aegis Godot Bridge initialized successfully at ${projectDir}`,
      installation: installation || undefined,
      installedAddonFiles: installedFiles
    };
  }

  private static ensureProjectGodotFile(projectDir: string): void {
    const projectGodotPath = path.join(projectDir, 'project.godot');
    if (!fs.existsSync(projectGodotPath)) {
      const defaultContent = [
        '; Engine configuration file.',
        'config_version=5',
        '',
        '[application]',
        'config/name="GodotGame"',
        'config/features=PackedStringArray("4.3", "Forward Plus")',
        ''
      ].join('\n');
      fs.writeFileSync(projectGodotPath, defaultContent, 'utf8');
    }
  }

  private static copyAddonFiles(projectDir: string): string[] {
    const addonDest = path.join(projectDir, 'addons', 'aegis_bridge');
    fs.mkdirSync(addonDest, { recursive: true });

    const sourceBase = this.resolveAddonSourceDir();
    const installed: string[] = [];

    if (fs.existsSync(sourceBase)) {
      const files = fs.readdirSync(sourceBase);
      for (const file of files) {
        const srcFile = path.join(sourceBase, file);
        const destFile = path.join(addonDest, file);
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, destFile);
          installed.push(`addons/aegis_bridge/${file}`);
        }
      }
    }
    return installed;
  }

  private static resolveAddonSourceDir(): string {
    const dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    const candidates = [
      path.resolve(dir, '..', 'gdscript', 'addons', 'aegis_bridge'),
      path.resolve(dir, '..', '..', 'gdscript', 'addons', 'aegis_bridge'),
      path.resolve(dir, '..', '..', '..', 'plugins', 'godot-bridge', 'gdscript', 'addons', 'aegis_bridge'),
      path.resolve(process.cwd(), 'packages', 'plugins', 'godot-bridge', 'gdscript', 'addons', 'aegis_bridge'),
      path.resolve(process.cwd(), 'node_modules', '@aegis', 'godot-bridge', 'gdscript', 'addons', 'aegis_bridge')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return candidates[0];
  }

  public static mergePluginIntoConfig(content: string, majorVersion = 4): string {
    const pluginPath = 'res://addons/aegis_bridge/plugin.cfg';
    if (content.includes(pluginPath)) return content;

    const packedMatch = content.match(/enabled=PackedStringArray\(([^)]*)\)/);
    if (packedMatch) {
      const inner = packedMatch[1].trim();
      const updated = inner.length > 0 ? `${inner}, "${pluginPath}"` : `"${pluginPath}"`;
      return content.replace(packedMatch[0], `enabled=PackedStringArray(${updated})`);
    }

    const arrayMatch = content.match(/enabled=\[([^\]]*)\]/);
    if (arrayMatch) {
      const inner = arrayMatch[1].trim();
      const updated = inner.length > 0 ? `${inner}, "${pluginPath}"` : `"${pluginPath}"`;
      return content.replace(arrayMatch[0], `enabled=[${updated}]`);
    }

    const pluginLine = majorVersion === 3
      ? `enabled=["${pluginPath}"]`
      : `enabled=PackedStringArray("${pluginPath}")`;

    if (content.includes('[editor_plugins]')) {
      return content.replace('[editor_plugins]', `[editor_plugins]\n\n${pluginLine}`);
    }
    return `${content.trimEnd()}\n\n[editor_plugins]\n\n${pluginLine}\n`;
  }

  private static enablePluginInProjectGodot(projectDir: string, majorVersion: number): void {
    const pPath = path.join(projectDir, 'project.godot');
    if (!fs.existsSync(pPath)) return;
    const content = fs.readFileSync(pPath, 'utf8');
    const updated = this.mergePluginIntoConfig(content, majorVersion);
    if (updated !== content) {
      fs.writeFileSync(pPath, updated, 'utf8');
    }
  }

  private static ensureAegisConfigFile(projectDir: string, port: number, binary?: string): void {
    const configPath = path.join(projectDir, 'aegis.config.json');
    let config: Record<string, unknown> = {};

    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        config = {};
      }
    }

    config.engine = 'godot';
    config.godot = {
      bridgePort: port,
      binaryPath: binary || undefined,
      aspectRatios: ['16:9', '21:9', '16:10', '9:16'],
      cacheDir: '.aegis/cache/godot'
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  }
}
