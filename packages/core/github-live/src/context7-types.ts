export interface Context7DocEntry {
  library: string;
  topic: string;
  version: string;
  summary: string;
  signatures: string[];
  codeExample?: string;
  breakingChanges?: string[];
}

export interface Context7QueryResult {
  matched: boolean;
  doc?: Context7DocEntry;
  source: 'builtin' | 'cache' | 'miss' | 'jit';
}
