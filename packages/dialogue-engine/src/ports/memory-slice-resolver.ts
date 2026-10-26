export interface MemorySymbolSlice {
  symbolName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  foldedSkeleton?: string;
  ambientTypes?: string[];
  calleeSignatures?: string[];
  upstreamCallers?: string[];
  context7Doc?: string;
}

export interface IMemorySliceResolver {
  resolveSlice(filePath: string, lineNumber?: number, symbolName?: string): Promise<MemorySymbolSlice | null>;
}
