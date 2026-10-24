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
  private parseHunkHeader(line: string): DiffChunk | null {
    const match = line.trim().match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:\s+.*)?$/);
    if (!match) return null;
    return {
      oldStart: parseInt(match[1], 10),
      oldLines: match[2] ? parseInt(match[2], 10) : 1,
      newStart: parseInt(match[3], 10),
      newLines: match[4] ? parseInt(match[4], 10) : 1,
      lines: []
    };
  }

  private processChunkLine(
    line: string,
    currentChunk: DiffChunk,
    counts: { added: number; deleted: number; unmodified: number }
  ): void {
    if (line.startsWith('+')) {
      counts.added++;
      currentChunk.lines.push(line);
    } else if (line.startsWith('-')) {
      counts.deleted++;
      currentChunk.lines.push(line);
    } else if (line.startsWith(' ') || line === '') {
      counts.unmodified++;
      currentChunk.lines.push(line);
    }
  }

  private evaluateSurgicalStatus(chunksCount: number, totalChanged: number, maxLines: number): { isSurgical: boolean; rejectionReason?: string } {
    if (chunksCount === 0) {
      return { isSurgical: false, rejectionReason: 'No valid Unified Diff chunks (@@ markers) detected.' };
    }
    if (totalChanged > maxLines) {
      return {
        isSurgical: false,
        rejectionReason: `Diff changes ${totalChanged} lines, exceeding surgical limit of ${maxLines} lines. Break down into smaller atomic commits.`
      };
    }
    return { isSurgical: true };
  }

  public parseAndValidate(diffText: string, maxAllowedChangedLines = 150): ParsedDiff {
    const lines = diffText.trimEnd().split('\n');
    let oldFile = '';
    let newFile = '';
    const counts = { added: 0, deleted: 0, unmodified: 0 };
    const chunks: DiffChunk[] = [];
    let currentChunk: DiffChunk | null = null;

    for (const line of lines) {
      const clean = line.replace(/\r$/, '');
      if (clean.startsWith('--- ')) oldFile = clean.substring(4).trim().replace(/^[ab]\//, '');
      else if (clean.startsWith('+++ ')) newFile = clean.substring(4).trim().replace(/^[ab]\//, '');
      else if (clean.trim().startsWith('@@ ')) {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = this.parseHunkHeader(clean);
      } else if (currentChunk) {
        this.processChunkLine(clean, currentChunk, counts);
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const totalChanged = counts.added + counts.deleted;
    const status = this.evaluateSurgicalStatus(chunks.length, totalChanged, maxAllowedChangedLines);

    return {
      oldFile,
      newFile,
      addedLinesCount: counts.added,
      deletedLinesCount: counts.deleted,
      unmodifiedLinesCount: counts.unmodified,
      chunks,
      isSurgical: status.isSurgical,
      rejectionReason: status.rejectionReason
    };
  }
}
