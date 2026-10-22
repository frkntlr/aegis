import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class RustSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'rust';
  public readonly supportedExtensions = ['.rs'];

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
    const pendingAttributes: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//')) {
        i++;
        continue;
      }

      if (trimmed.startsWith('#[')) {
        pendingAttributes.push(line);
        i++;
        continue;
      }

      i = this.handleDeclaration(lines, i, line, trimmed, pendingAttributes, output);
    }

    return output;
  }

  private handleDeclaration(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    pendingAttributes: string[],
    output: string[]
  ): number {
    if (this.isFunctionStart(trimmed)) {
      this.flushAttributes(pendingAttributes, output);
      const signature = this.consumeUntilBrace(lines, i);
      output.push(`${signature} { /* body omitted */ }`);
      return this.skipBlock(lines, i);
    }

    if (
      trimmed.startsWith('use ') ||
      trimmed.startsWith('pub use ') ||
      trimmed.startsWith('mod ') ||
      trimmed.startsWith('pub mod ') ||
      trimmed.startsWith('type ') ||
      trimmed.startsWith('pub type ') ||
      trimmed.startsWith('const ') ||
      trimmed.startsWith('pub const ')
    ) {
      this.flushAttributes(pendingAttributes, output);
      output.push(line);
      return i + 1;
    }

    if (trimmed.startsWith('struct ') || trimmed.startsWith('pub struct ') ||
        trimmed.startsWith('enum ') || trimmed.startsWith('pub enum ') ||
        trimmed.startsWith('trait ') || trimmed.startsWith('pub trait ') ||
        trimmed.startsWith('impl ') || trimmed.startsWith('pub impl ')) {
      this.flushAttributes(pendingAttributes, output);
      output.push(line);
      return i + 1;
    }

    pendingAttributes.length = 0;
    return i + 1;
  }

  private isFunctionStart(trimmed: string): boolean {
    return (
      trimmed.startsWith('fn ') ||
      trimmed.startsWith('pub fn ') ||
      trimmed.startsWith('pub(crate) fn ') ||
      trimmed.startsWith('async fn ') ||
      trimmed.startsWith('pub async fn ')
    );
  }

  private flushAttributes(pending: string[], output: string[]): void {
    if (pending.length > 0) {
      output.push(...pending);
      pending.length = 0;
    }
  }

  private consumeUntilBrace(lines: string[], startIndex: number): string {
    const parts: string[] = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (line.includes('{')) {
        parts.push(line.substring(0, line.indexOf('{')).trimEnd());
        break;
      }
      parts.push(line);
      i++;
    }
    return parts.join('\n');
  }

  private skipBlock(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpen = false;
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpen = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (foundOpen && braceCount <= 0) {
        return i + 1;
      }
      i++;
    }

    return i + 1;
  }
}
