import * as path from 'node:path';

export type TargetEcosystem = 'typescript' | 'godot' | 'python' | 'rust' | 'generic';

export class LanguageBarrierGate {
  public static resolveTargetEcosystem(filePath?: string, codeSnippet?: string): TargetEcosystem {
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
        return 'typescript';
      }
      if (['.gd', '.tscn', '.tres'].includes(ext)) {
        return 'godot';
      }
      if (ext === '.py') {
        return 'python';
      }
      if (ext === '.rs') {
        return 'rust';
      }
    }

    if (codeSnippet) {
      if (/^\s*(?:extends\s+|class_name\s+|func\s+|signal\s+|@onready\s+|@export\s+)/m.test(codeSnippet)) {
        return 'godot';
      }
      if (/\b(?:CharacterBody2D|CharacterBody3D|PackedScene|Vector2|Vector3|Callable)\b/.test(codeSnippet)) {
        return 'godot';
      }
      if (/\b(?:interface\s+[A-Z]|type\s+[A-Z]\w*\s*=|export\s+function|export\s+class)\b/.test(codeSnippet)) {
        return 'typescript';
      }
    }

    return 'generic';
  }

  public static isAllowedDoc(ecosystem: TargetEcosystem, library: string): boolean {
    const libLower = library.toLowerCase();
    if (ecosystem === 'typescript') {
      return !libLower.includes('godot');
    }
    if (ecosystem === 'godot') {
      return !libLower.includes('typescript') && !libLower.includes('node');
    }
    return true;
  }
}
