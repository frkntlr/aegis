import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

interface RustBlockState {
  braceCount: number;
  foundOpen: boolean;
  inComment: boolean;
  inRaw: boolean;
}

interface RustDeclarationContext {
  lines: string[];
  index: number;
  line: string;
  trimmed: string;
  pendingAttributes: string[];
  output: string[];
}

function skipStringLiteral(chars: string, j: number): number {
  const q = chars[j++];
  while (j < chars.length && chars[j] !== q) {
    if (chars[j] === '\\') j += 2;
    else j++;
  }
  return j + 1;
}

function advanceRustComment(s: string, j: number, state: RustBlockState): number {
  if (s[j] === '*' && s[j + 1] === '/') {
    state.inComment = false;
    return j + 2;
  }
  return j + 1;
}

function advanceRustRawString(s: string, j: number, state: RustBlockState): number {
  if (s[j] === '"' && s[j + 1] === '#') {
    state.inRaw = false;
    return j + 2;
  }
  return j + 1;
}

function matchRustCharLiteral(s: string, j: number): number {
  if (s[j] !== "'") return 0;
  if (s[j + 2] === "'") return 3;
  if (s[j + 1] === '\\' && s[j + 3] === "'") return 4;
  return 0;
}

function stepRustCodeChar(s: string, j: number, state: RustBlockState): number {
  if (s.startsWith('/*', j)) { state.inComment = true; return j + 2; }
  if (s.startsWith('r#"', j)) { state.inRaw = true; return j + 3; }
  if (s[j] === '"') return skipStringLiteral(s, j);
  const charLen = matchRustCharLiteral(s, j);
  if (charLen > 0) return j + charLen;
  if (s[j] === '{') { state.braceCount++; state.foundOpen = true; }
  else if (s[j] === '}') state.braceCount--;
  return j + 1;
}

function scanRustBlockLine(s: string, state: RustBlockState): void {
  let j = 0;
  while (j < s.length) {
    if (state.inComment) { j = advanceRustComment(s, j, state); continue; }
    if (state.inRaw) { j = advanceRustRawString(s, j, state); continue; }
    if (s[j] === '/' && s[j + 1] === '/') break;
    j = stepRustCodeChar(s, j, state);
  }
}

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

      i = this.handleDeclaration({ lines, index: i, line, trimmed, pendingAttributes, output });
    }

    return output;
  }

  private isItemDeclaration(trimmed: string): boolean {
    const prefixes = ['use ', 'pub use ', 'mod ', 'pub mod ', 'type ', 'pub type ', 'const ', 'pub const '];
    return prefixes.some(p => trimmed.startsWith(p));
  }

  private isTypeDefOrImpl(trimmed: string): boolean {
    const prefixes = ['struct ', 'pub struct ', 'enum ', 'pub enum ', 'trait ', 'pub trait ', 'impl ', 'pub impl '];
    return prefixes.some(p => trimmed.startsWith(p));
  }

  private handleDeclaration(ctx: RustDeclarationContext): number {
    const { lines, index, line, trimmed, pendingAttributes, output } = ctx;
    if (this.isFunctionStart(trimmed)) {
      this.flushAttributes(pendingAttributes, output);
      const signature = this.consumeUntilBrace(lines, index);
      output.push(`${signature} { /* body omitted */ }`);
      return this.skipBlock(lines, index);
    }

    if (this.isItemDeclaration(trimmed) || this.isTypeDefOrImpl(trimmed)) {
      this.flushAttributes(pendingAttributes, output);
      output.push(line);
      return index + 1;
    }

    pendingAttributes.length = 0;
    return index + 1;
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
    const state: RustBlockState = { braceCount: 0, foundOpen: false, inComment: false, inRaw: false };
    let i = startIndex;
    while (i < lines.length) {
      scanRustBlockLine(lines[i], state);
      if (state.foundOpen && state.braceCount <= 0) return i + 1;
      i++;
    }
    return i + 1;
  }
}
