import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class GDScriptSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'gdscript';
  public readonly supportedExtensions = ['.gd'];

  public extract(_filePath: string, sourceCode: string): SkeletonResult {
    const lines = sourceCode.split(/\r?\n/);
    const skeletonLines = this.processLines(lines);
    const skeletonContent = skeletonLines.join('\n');
    const originalLength = sourceCode.length;
    const skeletonLength = skeletonContent.length;
    const savings = originalLength > 0 ? ((originalLength - skeletonLength) / originalLength) * 100 : 0;

    return {
      originalLength,
      skeletonLength,
      tokenSavingsPercent: Math.max(0, Math.round(savings)),
      skeletonContent
    };
  }

  private processLines(lines: string[]): string[] {
    const output: string[] = [];
    const pendingAnnotations: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      if (trimmed.startsWith('@')) {
        pendingAnnotations.push(line);
        i++;
        continue;
      }

      i = this.handleDeclaration(lines, i, line, trimmed, pendingAnnotations, output);
    }

    return output;
  }

  private handleDeclaration(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    pendingAnnotations: string[],
    output: string[]
  ): number {
    if (trimmed.startsWith('func ') || trimmed.startsWith('static func ')) {
      this.flushAnnotations(pendingAnnotations, output);
      const funcDef = this.consumeUntilColon(lines, i);
      const indent = line.match(/^(\t|\s)*/)?.[0] ?? '';
      output.push(funcDef);
      output.push(`${indent}\tpass`);
      return this.skipBlock(lines, i);
    }

    if (
      trimmed.startsWith('extends ') ||
      trimmed.startsWith('class_name ') ||
      trimmed.startsWith('class ') ||
      trimmed.startsWith('signal ') ||
      trimmed.startsWith('enum ') ||
      trimmed.startsWith('const ') ||
      trimmed.startsWith('var ') ||
      trimmed.startsWith('@export') ||
      trimmed.startsWith('@onready')
    ) {
      this.flushAnnotations(pendingAnnotations, output);
      if (trimmed.startsWith('enum ') && !trimmed.endsWith('}')) {
        return this.consumeEnumBlock(lines, i, output);
      }
      output.push(line);
      return i + 1;
    }

    pendingAnnotations.length = 0;
    return i + 1;
  }

  private flushAnnotations(pending: string[], output: string[]): void {
    if (pending.length > 0) {
      output.push(...pending);
      pending.length = 0;
    }
  }

  private consumeUntilColon(lines: string[], startIndex: number): string {
    const parts: string[] = [];
    let i = startIndex;
    while (i < lines.length) {
      parts.push(lines[i]);
      if (lines[i].includes(':')) break;
      i++;
    }
    return parts.join('\n');
  }

  private consumeEnumBlock(lines: string[], startIndex: number, output: string[]): number {
    let i = startIndex;
    while (i < lines.length) {
      output.push(lines[i]);
      if (lines[i].includes('}')) break;
      i++;
    }
    return i + 1;
  }

  private skipBlock(lines: string[], startIndex: number): number {
    const baseIndent = lines[startIndex].match(/^(\t|\s)*/)?.[0].length ?? 0;
    let i = startIndex + 1;

    // consume multi-line signature
    while (i < lines.length && !lines[i - 1].includes(':')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }
      const indent = line.match(/^(\t|\s)*/)?.[0].length ?? 0;
      if (indent <= baseIndent) {
        break;
      }
      i++;
    }

    return i;
  }
}
