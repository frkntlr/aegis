/**
 * @file godot-ui-scaffolder.ts
 * Production-ready Godot 4.x UI scaffolding engine for menus, HUDs, dialogs, settings, inventory, and themes.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildMenuScene,
  buildMenuScript,
  buildHudScene,
  buildHudScript,
  buildDialogScene,
  buildDialogScript,
  buildSettingsScene,
  buildSettingsScript,
  buildInventoryScene,
  buildInventoryScript,
  buildThemeContent
} from './godot-ui-templates.js';

export type UiScaffoldType = 'menu' | 'hud' | 'dialog' | 'settings' | 'inventory' | 'theme';

export interface ScaffoldOptions {
  name: string;
  outputDir?: string;
  title?: string;
  themePath?: string;
}

export interface ScaffoldResult {
  type: UiScaffoldType;
  name: string;
  filesWritten: string[];
  scenePath?: string;
  scriptPath?: string;
  themePath?: string;
}

export class GodotUiScaffolder {
  public static scaffold(type: UiScaffoldType, options: ScaffoldOptions): ScaffoldResult {
    const outDir = options.outputDir ?? process.cwd();
    fs.mkdirSync(outDir, { recursive: true });
    const cleanName = options.name.replace(/\.[^/.]+$/, '');
    const pascal = this.toPascalCase(cleanName);

    if (type === 'theme') {
      const themeFile = path.join(outDir, `${cleanName}.tres`);
      fs.writeFileSync(themeFile, buildThemeContent(), 'utf8');
      return { type, name: cleanName, filesWritten: [themeFile], themePath: themeFile };
    }

    const sceneFile = path.join(outDir, `${cleanName}.tscn`);
    const scriptFile = path.join(outDir, `${cleanName}.gd`);
    const relScript = options.outputDir ? `./${cleanName}.gd` : `res://ui/${cleanName}.gd`;

    const { scene, script } = this.generateSceneAndScript(type, cleanName, pascal, relScript, options.title);
    fs.writeFileSync(sceneFile, scene, 'utf8');
    fs.writeFileSync(scriptFile, script, 'utf8');

    return {
      type,
      name: cleanName,
      filesWritten: [sceneFile, scriptFile],
      scenePath: sceneFile,
      scriptPath: scriptFile
    };
  }

  private static toPascalCase(str: string): string {
    return str.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  private static generateSceneAndScript(
    type: UiScaffoldType,
    name: string,
    pascal: string,
    scriptPath: string,
    titleArg?: string
  ): { scene: string; script: string } {
    if (type === 'hud') {
      return { scene: buildHudScene(name, scriptPath), script: buildHudScript(pascal) };
    }
    if (type === 'dialog') {
      return { scene: buildDialogScene(name, scriptPath, titleArg ?? 'Confirm Action'), script: buildDialogScript(pascal) };
    }
    if (type === 'settings') {
      return { scene: buildSettingsScene(name, scriptPath, titleArg ?? 'Settings'), script: buildSettingsScript(pascal) };
    }
    if (type === 'inventory') {
      return { scene: buildInventoryScene(name, scriptPath, titleArg ?? 'Inventory'), script: buildInventoryScript(pascal) };
    }
    return { scene: buildMenuScene(name, scriptPath, titleArg ?? pascal), script: buildMenuScript(pascal) };
  }
}
