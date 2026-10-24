import * as fs from 'node:fs';
import * as path from 'node:path';
import { RTKTokenKiller } from '@aegis/watchdog';
import { showBanner } from './banner.js';

export function handleRtkCompress(filePath?: string): void {
  showBanner();
  let content = '';

  if (filePath && filePath !== '-') {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Input log file not found: ${filePath}`);
      process.exit(1);
    }
    content = fs.readFileSync(resolved, 'utf8');
  } else {
    try {
      content = fs.readFileSync(0, 'utf8');
    } catch {
      console.error('❌ No terminal input provided on stdin.');
      process.exit(1);
    }
  }

  const res = RTKTokenKiller.compress(content);
  console.log(RTKTokenKiller.formatSummary(res));
  console.log('\n--- [Compressed Output] ---');
  console.log(res.compressedText);
}
