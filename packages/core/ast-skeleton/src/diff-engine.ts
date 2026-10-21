export interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface ParsedDiff {
  oldFile: string;
  newFile: string;
  addedLinesCount: number;
  deletedLinesCount: number;
  unmodifiedLinesCount: number;
  chunks: DiffChunk[];
  isSurgical: boolean;
  rejectionReason?: string;
}

export class DiffEngine {
  public parseAndValidate(diffText: string, maxAllowedChangedLines = 150): ParsedDiff {
    const lines = diffText.split('\n');
    let oldFile = '';
    let newFile = '';
    let added = 0;
    let deleted = 0;
    let unmodified = 0;
    const chunks: DiffChunk[] = [];
    let currentChunk: DiffChunk | null = null;

    for (const line of lines) {
      if (line.startsWith('--- ')) {
        oldFile = line.substring(4).trim().replace(/^[ab]\//, '');
      } else if (line.startsWith('+++ ')) {
        newFile = line.substring(4).trim().replace(/^[ab]\//, '');
      } else if (line.startsWith('@@ ')) {
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = {
            oldStart: parseInt(match[1], 10),
            oldLines: match[2] ? parseInt(match[2], 10) : 1,
            newStart: parseInt(match[3], 10),
            newLines: match[4] ? parseInt(match[4], 10) : 1,
            lines: []
          };
        }
      } else if (currentChunk) {
        if (line.startsWith('+')) {
          added++;
          currentChunk.lines.push(line);
        } else if (line.startsWith('-')) {
          deleted++;
          currentChunk.lines.push(line);
        } else if (line.startsWith(' ') || line === '') {
          unmodified++;
          currentChunk.lines.push(line);
        }
      }
    }

    if (currentChunk) chunks.push(currentChunk);

    const totalChanged = added + deleted;
    let isSurgical = true;
    let rejectionReason: string | undefined;

    if (chunks.length === 0) {
      isSurgical = false;
      rejectionReason = 'No valid Unified Diff chunks (@@ markers) detected.';
    } else if (totalChanged > maxAllowedChangedLines) {
      isSurgical = false;
      rejectionReason = `Diff changes ${totalChanged} lines, exceeding surgical limit of ${maxAllowedChangedLines} lines. Break down into smaller atomic commits.`;
    }

    return {
      oldFile,
      newFile,
      addedLinesCount: added,
      deletedLinesCount: deleted,
      unmodifiedLinesCount: unmodified,
      chunks,
      isSurgical,
      rejectionReason
    };
  }
}
