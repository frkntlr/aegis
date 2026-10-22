import type { SkeletonResult } from './ts-extractor.js';

export class GDScriptSkeletonExtractor {
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
      if (trimmed.startsWith('enum ') && trimmed.includes('{') && !trimmed.includes('}')) {
        this.flushAnnotations(pendingAnnotations, output);
        const { block, nextIndex } = this.consumeBracedBlock(lines, i);
        output.push(block);
        i = nextIndex;
        continue;
      }
      if (this.isHeaderOrDeclaration(trimmed)) {
        this.flushAnnotations(pendingAnnotations, output);
        output.push(line);
        i++;
        continue;
      }
      if (this.isFunctionHeader(trimmed)) {
        i = this.handleFunction(lines, i, pendingAnnotations, output);
        continue;
      }
      if (this.isVariableOrEnum(trimmed)) {
        this.flushAnnotations(pendingAnnotations, output);
        output.push(line);
      }
      i++;
    }
    return output;
  }

  private handleFunction(lines: string[], i: number, annotations: string[], output: string[]): number {
    this.flushAnnotations(annotations, output);
    const { header, nextIndex, indent } = this.consumeFunctionHeader(lines, i);
    output.push(header);
    output.push(`${' '.repeat(indent + 4)}pass`);
    return this.skipIndentedBody(lines, nextIndex, indent);
  }

  private flushAnnotations(annotations: string[], output: string[]): void {
    while (annotations.length > 0) {
      output.push(annotations.shift()!);
    }
  }

  private consumeBracedBlock(lines: string[], startIndex: number): { block: string; nextIndex: number } {
    const blockLines: string[] = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      blockLines.push(line);
      i++;
      if (line.includes('}')) {
        break;
      }
    }
    return { block: blockLines.join('\n'), nextIndex: i };
  }

  private isHeaderOrDeclaration(trimmed: string): boolean {
    return trimmed.startsWith('extends ') ||
           trimmed.startsWith('class_name ') ||
           trimmed.startsWith('signal ') ||
           trimmed.startsWith('const ') ||
           (trimmed.startsWith('class ') && trimmed.endsWith(':'));
  }

  private isFunctionHeader(trimmed: string): boolean {
    return (trimmed.startsWith('func ') || trimmed.startsWith('static func ')) &&
      (trimmed.includes('(') || trimmed.endsWith(':'));
  }

  private isVariableOrEnum(trimmed: string): boolean {
    return trimmed.startsWith('var ') ||
           trimmed.startsWith('enum ') ||
           trimmed.includes('enum ');
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
