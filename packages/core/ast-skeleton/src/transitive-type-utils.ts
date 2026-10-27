/**
 * @file transitive-type-utils.ts
 * Type definitions, builtins, and static formatters for Transitive Type Closure.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface TypeClosureOptions {
  maxDepth?: number;
  lineBudget?: number;
  enableOpaqueStubbing?: boolean;
  baseDir?: string;
  sourceFileProvider?: (filePath: string) => string | null;
}

export interface BoundedTypeClosureResult {
  fullDeclarations: string[];
  opaqueStubs: string[];
  monomorphizedTypes: string[];
  formattedBlock: string;
  exceededBudget: boolean;
  totalLines: number;
}

export const BUILTIN_TYPES = new Set(
  ('string number boolean void any unknown never null undefined Promise Record Array Map Set Error Date RegExp ' +
  'Partial Required Readonly Omit Pick Exclude Extract NonNullable ReturnType InstanceType Parameters ' +
  'ConstructorParameters object Function symbol bigint true false T K V R Buffer ArrayBuffer Uint8Array ' +
  'ReadableStream WritableStream URL URLSearchParams Headers Request Response AbortSignal Blob File FormData ' +
  'Iterable AsyncIterable Iterator AsyncIterator ReadonlyArray ReadonlyMap ReadonlySet ChildProcess NodeJS Event'
  ).split(' ')
);

export class TransitiveTypeUtils {
  public static extractTypeIdentifiers(typeText: string): string[] {
    const rawMatches = typeText.match(/\b[A-Z]\w*\b/g) || [];
    return [...new Set(rawMatches.filter(name => !BUILTIN_TYPES.has(name)))];
  }

  public static generateOpaqueStub(typeName: string): string {
    return `export type ${typeName} = { readonly __opaque: '${typeName}' };`;
  }

  public static monomorphizeGeneric(typeName: string, genericArgs: string[]): string {
    if (genericArgs.length === 0) return typeName;
    const cleanArgs = genericArgs.map(a => a.replace(/[^a-zA-Z0-9_]/g, '')).join('_');
    return `${typeName}_${cleanArgs}`;
  }
}
