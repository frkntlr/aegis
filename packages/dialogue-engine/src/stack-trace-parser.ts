import { ParsedEvidence, IEvidenceProvider } from './ports/evidence-provider.js';

export interface StackTraceLocation {
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  symbolName?: string;
  format: 'node_v8' | 'godot_res' | 'generic_posix';
  confidence: number;
}

export interface StackTraceParseResult {
  primaryLocation?: StackTraceLocation;
  allLocations: StackTraceLocation[];
  cleanedTrace: string;
  confidenceScore: number;
  needsClarification: boolean;
}

const ANSI_REGEX = /\u001b\[[0-9;]*m/g;
const NODE_V8_REGEX = /(?:^|\s+)at\s+(?:([a-zA-Z0-9_$.<>]+)\s+\()?(?:file:\/\/\/)?([a-zA-Z]:[\\/][^()]+|[a-zA-Z0-9_./\\-]+):(\d+):(\d+)\)?/;
const GODOT_RES_REGEX = /(?:SCRIPT ERROR:.*)?At:\s+(res:\/\/[^:]+):(\d+)(?::([a-zA-Z0-9_]+))?/;
const POSIX_LINE_REGEX = /(?:^|\s)([a-zA-Z0-9_./\\-]+\.(?:ts|js|gd|py|rs|cs|cpp|go)):(\d+)(?::(\d+))?/;

export class PolyglotStackTraceParser implements IEvidenceProvider {
  public parse(rawTrace: string): StackTraceParseResult {
    const cleanedTrace = stripAnsi(rawTrace).replace(/\r\n/g, '\n').trim();
    const lines = cleanedTrace.split('\n');
    const allLocations = this.extractLocations(lines);
    const primaryLocation = allLocations.find(l => !isInternalFrame(l.filePath));
    const confidenceScore = calculateConfidence(primaryLocation);

    return {
      primaryLocation,
      allLocations,
      cleanedTrace,
      confidenceScore,
      needsClarification: confidenceScore < 0.80
    };
  }

  public async parseEvidence(rawLogOrError: string): Promise<ParsedEvidence> {
    const res = this.parse(rawLogOrError);
    return {
      filePath: res.primaryLocation?.filePath,
      lineNumber: res.primaryLocation?.lineNumber,
      columnNumber: res.primaryLocation?.columnNumber,
      symbolName: res.primaryLocation?.symbolName,
      cleanedLog: res.cleanedTrace,
      confidenceScore: res.confidenceScore,
      needsClarification: res.needsClarification
    };
  }

  private extractLocations(lines: string[]): StackTraceLocation[] {
    const locations: StackTraceLocation[] = [];
    for (const line of lines) {
      const loc = parseTraceLine(line);
      if (loc) locations.push(loc);
    }
    return locations;
  }
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

function parseTraceLine(line: string): StackTraceLocation | null {
  return parseNodeV8(line) || parseGodotRes(line) || parseGenericPosix(line);
}

function parseNodeV8(line: string): StackTraceLocation | null {
  const match = line.match(NODE_V8_REGEX);
  if (!match) return null;
  return {
    symbolName: match[1] || undefined,
    filePath: normalizePath(match[2]),
    lineNumber: parseInt(match[3], 10),
    columnNumber: parseInt(match[4], 10),
    format: 'node_v8',
    confidence: 0.95
  };
}

function parseGodotRes(line: string): StackTraceLocation | null {
  const match = line.match(GODOT_RES_REGEX);
  if (!match) return null;
  const rawPath = match[1].replace(/^res:\/\//, '');
  return {
    symbolName: match[3] || undefined,
    filePath: normalizePath(rawPath),
    lineNumber: parseInt(match[2], 10),
    columnNumber: 1,
    format: 'godot_res',
    confidence: 0.90
  };
}

function parseGenericPosix(line: string): StackTraceLocation | null {
  if (line.includes('node:internal') || line.includes('node_modules')) return null;
  const match = line.match(POSIX_LINE_REGEX);
  if (!match) return null;
  return {
    filePath: normalizePath(match[1]),
    lineNumber: parseInt(match[2], 10),
    columnNumber: match[3] ? parseInt(match[3], 10) : 1,
    format: 'generic_posix',
    confidence: 0.85
  };
}

function isInternalFrame(filePath: string): boolean {
  return (
    filePath.includes('node:internal') ||
    filePath.includes('node_modules') ||
    filePath.startsWith('internal/')
  );
}

function calculateConfidence(primary?: StackTraceLocation): number {
  if (!primary) return 0.0;
  let score = primary.confidence;
  if (primary.symbolName) score = Math.min(1.0, score + 0.05);
  return Math.round(score * 100) / 100;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
