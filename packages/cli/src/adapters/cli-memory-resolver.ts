import * as fs from 'node:fs';
import {
  IMemorySliceResolver,
  MemorySymbolSlice
} from '@aegis/dialogue-engine';
import {
  CodebaseMemoryEngine,
  SymbolSliceExtractor
} from '@aegis/ast-skeleton';
import { getSharedMemoryEngine } from '../commands/memory-command.js';

export class CliMemorySliceResolver implements IMemorySliceResolver {
  private engine?: CodebaseMemoryEngine;
  private fallbackExtractor = new SymbolSliceExtractor();

  constructor(engine?: CodebaseMemoryEngine) {
    this.engine = engine;
  }

  private getEngine(): CodebaseMemoryEngine {
    if (!this.engine) {
      this.engine = getSharedMemoryEngine();
    }
    return this.engine;
  }

  public async resolveSlice(
    filePath: string,
    lineNumber?: number,
    symbolName?: string
  ): Promise<MemorySymbolSlice | null> {
    const symbol = symbolName || 'anonymous';
    try {
      const engine = this.getEngine();
      const res = engine.queryMemory(symbol, { filePath });
      if (res.found && res.slice) {
        return {
          symbolName: res.symbol,
          filePath: res.filePath || filePath,
          startLine: res.startLine ?? lineNumber ?? 1,
          endLine: res.endLine ?? (lineNumber ? lineNumber + 10 : 20),
          foldedSkeleton: res.slice,
          ambientTypes: res.groundTruthDocs,
          upstreamCallers: res.callers,
          context7Doc: res.groundTruthDocs?.[0]
        };
      }
    } catch { /* fallback to direct extractor */ }

    return this.resolveFallbackSlice(filePath, lineNumber, symbolName);
  }

  private resolveFallbackSlice(
    filePath: string,
    lineNumber?: number,
    symbolName?: string
  ): MemorySymbolSlice | null {
    try {
      if (symbolName) {
        const sliceRes = this.fallbackExtractor.extractSlice(symbolName);
        if (sliceRes) {
          return {
            symbolName: sliceRes.symbol,
            filePath: sliceRes.filePath || filePath,
            startLine: sliceRes.startLine,
            endLine: sliceRes.endLine,
            foldedSkeleton: sliceRes.codeSlice,
            ambientTypes: sliceRes.ambientTypes,
            calleeSignatures: sliceRes.calleeSignatures
          };
        }
      }
      if (fs.existsSync(filePath) && lineNumber) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        const start = Math.max(1, lineNumber - 5);
        const end = Math.min(lines.length, lineNumber + 5);
        return {
          symbolName: symbolName || 'snippet',
          filePath,
          startLine: start,
          endLine: end,
          foldedSkeleton: lines.slice(start - 1, end).join('\n')
        };
      }
    } catch { /* ignore */ }
    return null;
  }
}
