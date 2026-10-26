import * as fs from 'node:fs';
import {
  IEvidenceProvider,
  ParsedEvidence,
  PolyglotStackTraceParser
} from '@aegis/dialogue-engine';
import { RTKTokenKiller } from '@aegis/watchdog';

export class CliEvidenceProvider implements IEvidenceProvider {
  private parser: PolyglotStackTraceParser;

  constructor(parser?: PolyglotStackTraceParser) {
    this.parser = parser ?? new PolyglotStackTraceParser();
  }

  public async parseEvidence(rawLogOrError: string): Promise<ParsedEvidence> {
    const content = this.resolveContent(rawLogOrError);
    return this.parser.parseEvidence(content);
  }

  public compressContext(rawOutput: string): string {
    return RTKTokenKiller.compress(rawOutput).compressedText;
  }

  private resolveContent(input: string): string {
    const trimmed = input.trim();
    if (trimmed.length > 0 && !trimmed.includes('\n') && fs.existsSync(trimmed)) {
      try {
        return fs.readFileSync(trimmed, 'utf8');
      } catch {
        return input;
      }
    }
    return input;
  }
}
