import { StackTraceLocation } from './stack-trace-parser.js';
import { IMemorySliceResolver, MemorySymbolSlice } from './ports/memory-slice-resolver.js';

export interface TriangulatedContext {
  location: StackTraceLocation;
  slice?: MemorySymbolSlice;
  primaryHypothesis: string;
  callers: string[];
  isSlaBreached: boolean;
}

const DEFAULT_TIMEOUT_MS = 50;

export class AstTriangulator {
  public async triangulate(
    location: StackTraceLocation,
    resolver?: IMemorySliceResolver,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<TriangulatedContext> {
    if (!resolver) {
      return this.buildFallback(location, false);
    }

    try {
      const slice = await executeWithTimeout(
        resolver.resolveSlice(location.filePath, location.lineNumber, location.symbolName),
        timeoutMs
      );
      return this.buildContext(location, slice);
    } catch {
      return this.buildFallback(location, true);
    }
  }

  private buildContext(location: StackTraceLocation, slice: MemorySymbolSlice | null): TriangulatedContext {
    const sym = slice?.symbolName || location.symbolName || 'anonymousFunction';
    const primaryHypothesis = `Runtime defect in ${sym} at ${location.filePath}:${location.lineNumber}`;
    return {
      location,
      slice: slice || undefined,
      primaryHypothesis,
      callers: slice?.upstreamCallers || [],
      isSlaBreached: false
    };
  }

  private buildFallback(location: StackTraceLocation, slaBreached: boolean): TriangulatedContext {
    const sym = location.symbolName || 'unknownSymbol';
    return {
      location,
      primaryHypothesis: `Probable exception in ${sym} (${location.filePath}:${location.lineNumber})`,
      callers: [],
      isSlaBreached: slaBreached
    };
  }
}

async function executeWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('SLA timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
