export interface ParsedEvidence {
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  symbolName?: string;
  cleanedLog: string;
  confidenceScore: number;
  needsClarification: boolean;
}

export interface IEvidenceProvider {
  parseEvidence(rawLogOrError: string): Promise<ParsedEvidence>;
}
