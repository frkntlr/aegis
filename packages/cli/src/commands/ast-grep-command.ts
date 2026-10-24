import * as fs from 'node:fs';
import * as path from 'node:path';
import { AstGrepBridge } from '@aegis/ast-skeleton';
import { showBanner } from './banner.js';

export function handleAstSearch(pattern: string, targetPath = '.'): void {
  showBanner();
  const resolved = path.resolve(process.cwd(), targetPath);
  console.log(`🔍 ast-grep Pattern Search: "${pattern}" on ${targetPath}...\n`);

  const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null;
  const matches = stat?.isDirectory()
    ? AstGrepBridge.searchDirectory(resolved, pattern)
    : AstGrepBridge.searchFile(resolved, pattern);

  if (matches.length === 0) {
    console.log(`⚠️  No AST matches found for pattern: "${pattern}".`);
    return;
  }

  console.log(`✅ Found ${matches.length} AST match(es):`);
  for (const m of matches) {
    const loc = m.file ? `${m.file}:${m.startLine}-${m.endLine}` : `L${m.startLine}-${m.endLine}`;
    console.log(` • [${loc}]`);
    console.log(`   ${m.matchedText.trim()}`);
    const vars = Object.entries(m.metavars);
    if (vars.length > 0) {
      console.log(`   Metavars: ${vars.map(([k, v]) => `${k}="${v}"`).join(', ')}`);
    }
  }
}

export function handleAstReplace(pattern: string, rewrite: string, targetFile: string): void {
  showBanner();
  const resolved = path.resolve(process.cwd(), targetFile);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ Target file not found: ${targetFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const res = AstGrepBridge.replace(content, pattern, rewrite);

  if (!res.hasChanges) {
    console.log(`⚠️  No occurrences of pattern "${pattern}" found to replace in ${targetFile}.`);
    return;
  }

  fs.writeFileSync(resolved, res.transformed, 'utf8');
  console.log(`✅ ast-grep Refactored ${res.matchCount} occurrence(s) in ${targetFile}!`);
}
