import type { SkeletonResult } from './ts-extractor.js';

export class PythonSkeletonExtractor {
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
      if (this.isImport(trimmed)) {
        output.push(line);
        i++;
        continue;
      }
      if (this.isClassHeader(trimmed)) {
        this.flushDecorators(pendingDecorators, output);
        output.push(line);
        i++;
        continue;
      }
      if (this.isFunctionHeader(trimmed)) {
        i = this.handleFunction(lines, i, pendingDecorators, output);
        continue;
      }
      if (this.isVariableOrConstant(trimmed)) {
        this.flushDecorators(pendingDecorators, output);
        output.push(line);
      }
      i++;
    }
    return output;
  }

  private handleFunction(lines: string[], i: number, decorators: string[], output: string[]): number {
    this.flushDecorators(decorators, output);
    const { header, nextIndex, indent } = this.consumeFunctionHeader(lines, i);
    output.push(header);
    output.push(`${' '.repeat(indent + 4)}...`);
    return this.skipIndentedBody(lines, nextIndex, indent);
  }

  private flushDecorators(decorators: string[], output: string[]): void {
    while (decorators.length > 0) {
      output.push(decorators.shift()!);
    }
  }

  private isImport(trimmed: string): boolean {
    return trimmed.startsWith('import ') || trimmed.startsWith('from ');
  }

  private isClassHeader(trimmed: string): boolean {
    return trimmed.startsWith('class ') && trimmed.endsWith(':');
  }

  private isFunctionHeader(trimmed: string): boolean {
    return (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) &&
      (trimmed.includes('(') || trimmed.endsWith(':'));
  }

  private isVariableOrConstant(trimmed: string): boolean {
    if (trimmed.startsWith('def ') || trimmed.startsWith('class ')) return false;
    // Common Python type annotations or assignments: VAR: Type = val or VAR = val
    return /^[A-Za-z_][A-Za-z0-9_]*(\s*:\s*[^=]+)?\s*=/.test(trimmed) ||
           /^[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z0-9_\[\], ]+$/.test(trimmed);
  }

  private getIndentation(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private consumeFunctionHeader(lines: string[], startIndex: number): { header: string; nextIndex: number; indent: number } {
    const indent = this.getIndentation(lines[startIndex]);
    const headerLines: string[] = [];
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];
      headerLines.push(line);
      i++;
      if (line.trim().endsWith(':')) {
        break;
      }
    }

    return {
      header: headerLines.join('\n'),
      nextIndex: i,
      indent
    };
  }

  private skipIndentedBody(lines: string[], startIndex: number, baseIndent: number): number {
    let j = startIndex;
    while (j < lines.length) {
      const line = lines[j];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        j++;
        continue;
      }
      const currentIndent = this.getIndentation(line);
      if (currentIndent <= baseIndent) {
        break;
      }
      j++;
    }
    return j;
  }
}
