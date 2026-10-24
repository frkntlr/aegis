import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class PythonSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'python';
  public readonly supportedExtensions = ['.py'];

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
    const pendingDecorators: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      if (trimmed.startsWith('@')) {
        pendingDecorators.push(line);
        i++;
        continue;
      }

      i = this.handleDeclaration(lines, i, line, trimmed, pendingDecorators, output);
    }

    return output;
  }

  private isTopLevelAssignment(line: string, trimmed: string): boolean {
    const indent = (line.match(/^\s*/)?.[0] ?? '').length;
    return indent === 0 &&
      !trimmed.includes('==') &&
      !trimmed.startsWith('self.') &&
      /^[A-Za-z_]\w*(?:\s*:\s*[^=]+)?\s*=\s*(?!=)/.test(trimmed);
  }

  private handleDeclaration(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    pendingDecorators: string[],
    output: string[]
  ): number {
    if (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) {
      this.flushDecorators(pendingDecorators, output);
      const { header, nextIndex } = this.consumeHeader(lines, i);
      const indent = line.match(/^\s*/)?.[0] ?? '';
      const baseIndent = (line.match(/^\s*/)?.[0] ?? '').length;
      output.push(header);
      output.push(`${indent}    ...`);
      return this.skipBlock(lines, nextIndex, baseIndent);
    }

    if (trimmed.startsWith('class ')) {
      this.flushDecorators(pendingDecorators, output);
      const { header, nextIndex } = this.consumeHeader(lines, i);
      output.push(header);
      return nextIndex;
    }

    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
      this.flushDecorators(pendingDecorators, output);
      output.push(line);
      return i + 1;
    }

    if (this.isTopLevelAssignment(line, trimmed)) {
      this.flushDecorators(pendingDecorators, output);
      output.push(line);
      return i + 1;
    }

    pendingDecorators.length = 0;
    return i + 1;
  }

  private flushDecorators(pending: string[], output: string[]): void {
    if (pending.length > 0) {
      output.push(...pending);
      pending.length = 0;
    }
  }

  private consumeHeader(lines: string[], startIndex: number): { header: string; nextIndex: number } {
    const parts: string[] = [];
    let i = startIndex;
    let parenDepth = 0;
    while (i < lines.length) {
      const line = lines[i];
      parts.push(line);
      for (const ch of line) {
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      }
      if (parenDepth === 0 && line.includes(':')) {
        return { header: parts.join('\n'), nextIndex: i + 1 };
      }
      i++;
    }
    return { header: parts.join('\n'), nextIndex: i };
  }

  private skipBlock(lines: string[], startIndex: number, baseIndent: number): number {
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= baseIndent) {
        break;
      }
      i++;
    }
    return i;
  }
}
