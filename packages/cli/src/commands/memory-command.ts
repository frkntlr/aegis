import * as fs from 'node:fs';
import * as path from 'node:path';
import { CodebaseMemoryEngine, CodebaseMemoryWatcher, ActiveHeadResolver, type MemoryQueryResult } from '@aegis/ast-skeleton';
import { Context7Bridge } from '@aegis/github-live';
import { RTKTokenKiller } from '@aegis/watchdog';
import { showBanner } from './banner.js';
import { generateLanguageConstitution } from './prompt-command.js';

let sharedEngine: CodebaseMemoryEngine | null = null;

export function getSharedMemoryEngine(): CodebaseMemoryEngine {
  if (!sharedEngine) {
    const bridge = new Context7Bridge();
    sharedEngine = new CodebaseMemoryEngine({
      docProvider: (lib, top) => {
        const res = bridge.query(lib, top);
        if (res.matched && res.doc) {
          const sigs = res.doc.signatures.slice(0, 3).map(s => `  - ${s}`).join('\n');
          const breaks = res.doc.breakingChanges?.length ? `\n  ⚠️ ${res.doc.breakingChanges[0]}` : '';
          return `[${res.doc.library.toUpperCase()} v${res.doc.version}] ${res.doc.summary}\n${sigs}${breaks}`;
        }
        return null;
      },
      logCompressor: (raw) => {
        const c = RTKTokenKiller.compress(raw);
        return { text: c.compressedText, tokenSavingsPercent: c.tokenSavingsPercent };
      },
      constitutionProvider: (fp) => {
        return generateLanguageConstitution([fp]).split('\n').filter(Boolean);
      }
    });
  }
  return sharedEngine;
}

function formatEdgeEndpoint(endpoint: string): string {
  if (endpoint.includes('::')) {
    const [fp, sym] = endpoint.split('::');
    return `${path.basename(fp)}::${sym}`;
  }
  return path.basename(endpoint);
}

function printMemoryQueryResult(res: MemoryQueryResult): void {
  console.log(`🧠 Codebase Memory: '${res.symbol}' [${res.filePath || 'virtual'}]`);
  console.log(` • Sliced Tokens:  ~${res.tokenSavingsPercent}% Token Savings`);
  console.log(` • Upstream:       ${res.callers.length > 0 ? res.callers.map(formatEdgeEndpoint).join(', ') : 'None'}`);
  console.log(` • Downstream:     ${res.callees.length > 0 ? res.callees.map(formatEdgeEndpoint).join(', ') : 'None'}`);
  console.log(` • Blast Radius:   ${res.blastRadius.length} file(s)`);

  if (res.groundTruthDocs.length > 0) {
    console.log('\n📚 Ground-Truth Engine Documentation (Context7):');
    for (const d of res.groundTruthDocs) console.log(`   ${d}`);
  }

  if (res.constitutionRules.length > 0) {
    console.log('\n🛡️  Demir Kafes Guardrails:');
    for (const r of res.constitutionRules.slice(0, 4)) console.log(`   - ${r}`);
  }

  if (res.slice) {
    console.log('\n' + res.slice);
  }
}

export function handleMemoryQuery(symbol?: string, worktreeId?: string, rawLogsPath?: string): void {
  showBanner();
  if (!symbol) {
    console.error('❌ Usage: aegis memory:query <symbol> [worktreeId] [rawLogsPath]');
    process.exit(1);
  }

  const activeWorktree = (worktreeId && worktreeId !== 'default')
    ? worktreeId
    : ActiveHeadResolver.resolveActiveWorktree();

  const engine = getSharedMemoryEngine();
  const stats = engine.getMemoryStats(activeWorktree);
  if (stats.totalFiles === 0 || stats.totalEdges === 0) {
    const scanDir = fs.existsSync('packages') ? 'packages' : '.';
    engine.indexDirectory(scanDir, activeWorktree);
  }

  let rawLogs: string | undefined;
  if (rawLogsPath && fs.existsSync(rawLogsPath)) {
    rawLogs = fs.readFileSync(rawLogsPath, 'utf8');
  }

  const res = engine.queryMemory(symbol, { worktreeId: activeWorktree, rawLogs });
  if (!res.found) {
    console.log(`⚠️  Symbol '${symbol}' not found in Codebase Memory [worktree: ${activeWorktree}].`);
    return;
  }
  printMemoryQueryResult(res);
}

export function handleMemoryStats(worktreeId?: string): void {
  showBanner();
  const activeWorktree = (worktreeId && worktreeId !== 'default')
    ? worktreeId
    : ActiveHeadResolver.resolveActiveWorktree();

  const engine = getSharedMemoryEngine();
  const s = engine.getMemoryStats(activeWorktree);

  console.log(`🧠 Codebase Memory Diagnostics [Worktree: ${s.worktreeId}]`);
  console.log(` • Indexed Files:       ${s.totalFiles}`);
  console.log(` • Indexed Symbols:     ${s.totalSymbols}`);
  console.log(` • AST Graph Nodes:     ${s.totalNodes}`);
  console.log(` • Relational Edges:    ${s.totalEdges}`);
  console.log(` • Estimated Savings:   ~${s.estimatedTokenSavings}% Token Reduction`);
}

export function handleMemoryRefresh(dirPath = 'packages', worktreeId?: string): void {
  showBanner();
  const activeWorktree = (worktreeId && worktreeId !== 'default')
    ? worktreeId
    : ActiveHeadResolver.resolveActiveWorktree();

  const engine = getSharedMemoryEngine();
  const target = path.resolve(process.cwd(), dirPath);
  console.log(`🔄 Refreshing Codebase Memory for: ${path.relative(process.cwd(), target) || '.'}...`);

  const t0 = performance.now();
  const report = engine.indexDirectory(target, activeWorktree);
  const dur = (performance.now() - t0).toFixed(2);

  console.log(`✅ Memory Refreshed in ${dur}ms:`);
  console.log(` • Newly Indexed Files: ${report.indexed}`);
  console.log(` • Cache Hits:          ${report.cached}`);
}

export function handleMemoryWatch(dirPath = 'packages', worktreeId?: string): CodebaseMemoryWatcher | null {
  showBanner();
  const activeWorktree = (worktreeId && worktreeId !== 'default')
    ? worktreeId
    : ActiveHeadResolver.resolveActiveWorktree();

  const engine = getSharedMemoryEngine();
  const target = path.resolve(process.cwd(), dirPath);
  console.log(`👁️  Live Codebase Memory Watcher active on: ${path.relative(process.cwd(), target) || '.'} [${activeWorktree}]`);

  const watcher = new CodebaseMemoryWatcher(engine, { worktreeId: activeWorktree, debounceMs: 150 });
  const started = watcher.start(target);
  if (!started) {
    console.error(`❌ Could not start watcher on: ${target}`);
    return null;
  }
  console.log('   Watching for file changes... (Press Ctrl+C to terminate)');
  return watcher;
}
