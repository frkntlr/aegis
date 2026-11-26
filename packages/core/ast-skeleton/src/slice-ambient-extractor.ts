/**
 * @file slice-ambient-extractor.ts
 * Multi-language ambient context and import extraction for surgical code slicing.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

interface PolyglotAmbientRule {
  ext: string;
  tag: string;
  prefix: string;
  prefixes: readonly string[];
}

const POLYGLOT_AMBIENT_RULES: readonly PolyglotAmbientRule[] = [
  { ext: '.py', tag: 'Python', prefix: '#', prefixes: ['import ', 'from ', 'class '] },
  { ext: '.rs', tag: 'Rust', prefix: '//', prefixes: ['use ', 'pub use ', 'mod '] },
  { ext: '.go', tag: 'Go', prefix: '//', prefixes: ['package ', 'import ', 'type '] }
];

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
    const rule = POLYGLOT_AMBIENT_RULES.find(r => filePath.endsWith(r.ext));
    if (!rule) return '';

    const ambient = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(trimmed => rule.prefixes.some(prefix => trimmed.startsWith(prefix)));
    if (ambient.length === 0) return '';

    return [
      `${rule.prefix} 🌐 [${rule.tag} Ambient State - Imports & Scope]`,
      ...ambient.map(line => `${rule.prefix} - ${line}`)
    ].join('\n');
  }
}
