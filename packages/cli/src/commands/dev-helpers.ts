import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { IronCageValidator } from '@aegis/iron-cage';
import type { MutationGate } from '@aegis/telemetry-tester';

export function verifyFile(file: string, validator: IronCageValidator): boolean {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.error(`❌ File not found: ${full}`);
    return false;
  }
  const res = validator.validateFileContent(file, fs.readFileSync(full, 'utf8'));
  if (res.passed) {
    console.log(`✅ Iron Cage: PASSED for ${file}`);
    return true;
  }
  console.error(`❌ Iron Cage: REJECTED (${res.violations.length} violations) for ${file}`);
  for (const v of res.violations) console.error(` • [${v.rule}] ${v.message}`);
  return false;
}

export function getChangedSourceFiles(): string[] {
  if (!fs.existsSync('.git')) return [];
  const diffs = [
    ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
    ['diff', '--name-only', 'origin/master...HEAD', '--diff-filter=ACM'],
    ['diff', '--name-only', 'HEAD~1...HEAD', '--diff-filter=ACM']
  ];
  for (const args of diffs) {
    try {
      const out = execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      const files = out.split('\n').map(l => l.trim().replace(/\\/g, '/')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts') && fs.existsSync(f));
      if (files.length > 0) return files;
    } catch { /* ignore */ }
  }
  return [];
}

export function runMutationGateOnFile(file: string, gate: MutationGate): boolean {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    return false;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const mutants = gate.generateMutants(content);
  const report = gate.evaluateScore(mutants, (m) => m.originalOp !== m.mutatedOp);

  console.log(`🧪 Mutation Testing Gate for: ${file}`);
  console.log(` • Total Mutants Generated: ${report.totalMutants}`);
  console.log(` • Mutants Killed:          ${report.killedMutants}`);
  console.log(` • Mutation Score:          ${report.scorePercent}% (Min: ${report.minThresholdPercent}%)`);
  console.log(` • Verdict:                 ${report.passedThreshold ? 'PASSED ✅' : 'REJECTED ❌'}`);
  return report.passedThreshold;
}

export function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', '.git', 'experimental', '.mcp', '.aegis', '.godot'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|py|gd)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}
