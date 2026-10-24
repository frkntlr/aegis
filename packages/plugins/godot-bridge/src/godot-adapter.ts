import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IdeCapabilities {
  supportsMcp: boolean;
  supportsSkills: boolean;
  supportsSubagents: boolean;
  mcpConfigFile?: string;
}

export interface IdeExclusionResult {
  ideId: string;
  success: boolean;
  configuredFiles: string[];
}

export interface IdeAdapter {
  readonly ideId: string;
  readonly name: string;
  readonly capabilities: IdeCapabilities;
  setupExclusions(repoRoot: string): IdeExclusionResult;
}

export class GodotIdeAdapter implements IdeAdapter {
  public readonly ideId = 'godot';
  public readonly name = 'Godot Engine Autonomous Bridge';
  public readonly capabilities: IdeCapabilities = {
    supportsMcp: true,
    supportsSkills: true,
    supportsSubagents: false,
    mcpConfigFile: '.godot/aegis_mcp.json'
  };

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const configuredFiles: string[] = [];
    const ignoreDirs = [
      path.join(repoRoot, 'experimental'),
      path.join(repoRoot, '.aegis'),
      path.join(repoRoot, 'node_modules')
    ];

    for (const dir of ignoreDirs) {
      if (fs.existsSync(dir)) {
        const gdignore = path.join(dir, '.gdignore');
        if (!fs.existsSync(gdignore)) {
          fs.writeFileSync(gdignore, '', 'utf8');
          configuredFiles.push(gdignore);
        }
      }
    }

    this.ensureProjectGodotAddon(repoRoot, configuredFiles);

    return {
      ideId: this.ideId,
      success: true,
      configuredFiles
    };
  }

  public detectProject(repoRoot: string): { isGodot: boolean; projectGodotPath?: string } {
    const candidate = path.join(repoRoot, 'project.godot');
    if (fs.existsSync(candidate)) {
      return { isGodot: true, projectGodotPath: candidate };
    }
    return { isGodot: false };
  }

  private ensureProjectGodotAddon(repoRoot: string, configuredFiles: string[]): void {
    const projectGodot = path.join(repoRoot, 'project.godot');
    if (!fs.existsSync(projectGodot)) return;

    try {
      let content = fs.readFileSync(projectGodot, 'utf8');
      if (!content.includes('aegis_bridge')) {
        content += '\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/aegis_bridge/plugin.cfg")\n';
        fs.writeFileSync(projectGodot, content, 'utf8');
        configuredFiles.push(projectGodot);
      }
    } catch {
      // ignore write errors
    }
  }
}
