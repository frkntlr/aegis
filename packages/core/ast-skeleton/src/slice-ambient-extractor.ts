/**
 * @file slice-ambient-extractor.ts
 * Multi-language ambient context and import extraction for surgical code slicing.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export class SliceAmbientExtractor {
  public static extractGdscriptAmbient(content: string): string {
    const lines = content.split(/\r?\n/);
    const ambientLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('extends ') ||
        trimmed.startsWith('class_name ') ||
        trimmed.startsWith('signal ') ||
        trimmed.startsWith('@onready ') ||
        (trimmed.startsWith('@export ') && trimmed.includes('var '))
      ) {
        ambientLines.push(trimmed);
      }
    }
    if (ambientLines.length === 0) return '';
    return ['# 🎮 [GDScript Ambient State - Signals & Onready Nodes]', ...ambientLines].join('\n');
  }

  public static extractFileImports(content: string, prefix = '//'): string {
    const lines = content.split(/\r?\n/);
    const importLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('import ') || trimmed.startsWith('export {') || trimmed.startsWith('from ')) {
        importLines.push(trimmed);
      }
    }
    if (importLines.length === 0) return '';
    return [`${prefix} 📦 [File Imports]`, ...importLines.map(l => `${prefix} - ${l}`)].join('\n');
  }

  public static extractPolyglotAmbient(filePath: string, content: string): string {
    const lines = content.split(/\r?\n/);
    const ambient: string[] = [];
    const isPy = filePath.endsWith('.py');
    const isRs = filePath.endsWith('.rs');
    const prefix = isPy ? '#' : '//';

    for (const line of lines) {
      const trimmed = line.trim();
      if (isPy && (trimmed.startsWith('import ') || trimmed.startsWith('from ') || trimmed.startsWith('class '))) {
        ambient.push(trimmed);
      } else if (isRs && (trimmed.startsWith('use ') || trimmed.startsWith('pub use ') || trimmed.startsWith('mod '))) {
        ambient.push(trimmed);
      } else if (filePath.endsWith('.go') && (trimmed.startsWith('package ') || trimmed.startsWith('import ') || trimmed.startsWith('type '))) {
        ambient.push(trimmed);
      }
    }
    if (ambient.length === 0) return '';
    const tag = isPy ? 'Python' : (isRs ? 'Rust' : 'Go');
    return [`${prefix} 🌐 [${tag} Ambient State - Imports & Scope]`, ...ambient.map(l => `${prefix} - ${l}`)].join('\n');
  }
}
