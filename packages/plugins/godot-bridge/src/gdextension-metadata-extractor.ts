/**
 * @file gdextension-metadata-extractor.ts
 * Native metadata extractor for Godot 4 GDExtension binary and script wrappers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GdExtensionClassInfo {
  name: string;
  inherits?: string;
  methods: string[];
  signals: string[];
  filePath?: string;
}

export interface GdExtensionContract {
  pluginName: string;
  entrySymbol: string;
  compatibilityMinimum?: string;
  classes: GdExtensionClassInfo[];
}

export class GdExtensionMetadataExtractor {
  public static parseGdExtensionManifest(manifestContent: string): { entrySymbol: string; compatibilityMinimum?: string } {
    let entrySymbol = '';
    let compatibilityMinimum: string | undefined;

    const lines = manifestContent.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const entryMatch = line.match(/^entry_symbol\s*=\s*['"]?([^'"]+)['"]?/);
      if (entryMatch) {
        entrySymbol = entryMatch[1].trim();
      }
      const compatMatch = line.match(/^compatibility_minimum\s*=\s*['"]?([^'"]+)['"]?/);
      if (compatMatch) {
        compatibilityMinimum = compatMatch[1].trim();
      }
    }
    return { entrySymbol, compatibilityMinimum };
  }

  private static parseGdScriptWrapper(content: string, filePath: string): GdExtensionClassInfo | null {
    let name = path.basename(filePath, '.gd');
    let inherits: string | undefined;
    const methods: string[] = [];
    const signals: string[] = [];

    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('#')) continue;

      const classMatch = line.match(/^class_name\s+([A-Za-z0-9_]+)/);
      if (classMatch) name = classMatch[1];

      const extMatch = line.match(/^extends\s+([A-Za-z0-9_]+)/);
      if (extMatch) inherits = extMatch[1];

      const funcMatch = line.match(/^func\s+([A-Za-z0-9_]+)\s*\((.*?)\)/);
      if (funcMatch) methods.push(`${funcMatch[1]}(${funcMatch[2].trim()})`);

      const sigMatch = line.match(/^signal\s+([A-Za-z0-9_]+)/);
      if (sigMatch) signals.push(sigMatch[1]);
    }

    return { name, inherits, methods, signals, filePath };
  }

  private static parseHppWrapper(content: string, filePath: string): GdExtensionClassInfo | null {
    const classMatch = content.match(/class\s+([A-Za-z0-9_]+)\s*:\s*public\s+([A-Za-z0-9_]+)/);
    if (!classMatch) return null;

    const name = classMatch[1];
    const inherits = classMatch[2];
    const methods: string[] = [];
    const signals: string[] = [];

    const methodMatches = content.matchAll(/(?:virtual\s+)?(?:void|[A-Za-z0-9_<>*&]+)\s+([A-Za-z0-9_]+)\s*\((.*?)\)\s*(?:const)?\s*;/g);
    for (const m of methodMatches) {
      if (!m[1].startsWith('_')) {
        methods.push(`${m[1]}(${m[2].trim()})`);
      }
    }

    return { name, inherits, methods: methods.slice(0, 15), signals, filePath };
  }

  public static scanAddonWrappers(addonDir: string): GdExtensionClassInfo[] {
    const classes: GdExtensionClassInfo[] = [];
    if (!fs.existsSync(addonDir)) return classes;

    const entries = fs.readdirSync(addonDir, { recursive: true });
    for (const entry of entries) {
      const fullPath = path.join(addonDir, String(entry));
      if (!fs.statSync(fullPath).isFile()) continue;

      const ext = path.extname(fullPath).toLowerCase();
      const content = fs.readFileSync(fullPath, 'utf8');

      if (ext === '.gd') {
        const info = GdExtensionMetadataExtractor.parseGdScriptWrapper(content, fullPath);
        if (info) classes.push(info);
      } else if (ext === '.hpp' || ext === '.h') {
        const info = GdExtensionMetadataExtractor.parseHppWrapper(content, fullPath);
        if (info) classes.push(info);
      }
    }
    return classes;
  }

  public static extractFromProject(projectRoot: string): GdExtensionContract[] {
    const addonsDir = path.join(projectRoot, 'addons');
    if (!fs.existsSync(addonsDir)) return [];

    const contracts: GdExtensionContract[] = [];
    const addonFolders = fs.readdirSync(addonsDir);

    for (const folder of addonFolders) {
      const addonPath = path.join(addonsDir, folder);
      if (!fs.statSync(addonPath).isDirectory()) continue;

      const files = fs.readdirSync(addonPath);
      const manifestFile = files.find(f => f.endsWith('.gdextension'));
      if (!manifestFile) continue;

      const manifestContent = fs.readFileSync(path.join(addonPath, manifestFile), 'utf8');
      const { entrySymbol, compatibilityMinimum } = GdExtensionMetadataExtractor.parseGdExtensionManifest(manifestContent);
      const classes = GdExtensionMetadataExtractor.scanAddonWrappers(addonPath);

      contracts.push({
        pluginName: folder,
        entrySymbol,
        compatibilityMinimum,
        classes
      });
    }

    return contracts;
  }
}
