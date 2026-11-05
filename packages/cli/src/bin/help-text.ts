/**
 * @file help-text.ts
 * Categorized and searchable CLI Help Menu with Demir Kafes compliance.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from '../commands/banner.js';

export const HELP_CATEGORIES: Record<string, readonly string[]> = {
  '🤝 Teamwork, Subagents & Swarm Orchestration': [
    '  aegis teamwork [status]                View active Antigravity subagents and locked tracks',
    '  aegis teamwork plan "<objective>"      Generate Antigravity subagent plan and stage in TIP inbox',
    '  aegis teamwork setup [outDir]          Export Antigravity subagents manifest (.aegis/subagents.json)',
    '  aegis teamwork matrix [planId]         Display live Antigravity subagent task status matrix',
    '  aegis teamwork dag [objective]         Display ASCII Execution Waves dependency graph (DAG)',
    '  aegis teamwork compact [obj]           Archive completed tasks & print Antigravity Compact briefing',
    '  aegis teamwork analyze "<obj>"         Sub-10ms fast semantic codebase analysis and file discovery',
    '  aegis teamwork clear                   Reset active teamwork tracks, inbox, and file locks',
    '  aegis tw:status                        View active Antigravity subagents and locks (shorthand)',
    '  aegis tw:plan "<objective>"            Generate Antigravity subagent plan (shorthand)',
    '  aegis tw:matrix                        Display live subagent status matrix (shorthand)',
    '  aegis tw:dag                           Display ASCII Execution Waves DAG (shorthand)',
    '  aegis tw:clear                         Reset active teamwork tracks (shorthand)',
    '  tw [status|plan|matrix|dag|clear]      Fast shorthand alias for aegis teamwork'
  ],
  '📋 TIP Tasks, Mutex Locks & Worktrees': [
    '  aegis task:list [status]               List ready, in_progress, or blocked tasks in TIP queue',
    '  aegis task:claim <id> [agent]          Claim a task for an agent role and acquire file locks',
    '  aegis task:release <id> [status]       Release or complete task and release file locks',
    '  aegis task:inject <id> [agent]         Compile prompt and stage task into .aegis/task-inbox.json',
    '  aegis task:pull [agent]                Pull the next staged autonomous task from TIP inbox',
    '  aegis task:clear                       Purge all staged tasks from TIP task inbox',
    '  aegis task:verify [file]               Run Multimodal Quality Gate (Demir Kafes + Godot Playtest)',
    '  aegis lock:status                      Inspect active file mutex locks across worktrees',
    '  aegis lock:clear                       Release all active mutex locks across all worktrees',
    '  aegis prompt [role|id] [id]            Compile surgical AST prompt caching context',
    '  aegis contribute <issue> [agent]       Prepare isolated worktree & prompt for contribution'
  ],
  '🎮 Godot Engine 4.7 Bridge & Quality Gates': [
    '  aegis godot status                     Inspect running Godot editor & bridge status',
    '  aegis godot playtest [duration]        Execute non-blocking autonomous playtest session',
    '  aegis godot test <test_file>           Execute Godot unit tests with headless test runner',
    '  aegis godot inspect [node_path]        Inspect Godot runtime UI hierarchy and touch targets',
    '  aegis godot ui:lint <scene>            Run static Godot 4 UI compliance linter',
    '  aegis godot ui:scaffold <type> <name>  Scaffold production-ready Godot 4 UI container',
    '  aegis cage:check [dir]                 Run Demir Kafes architecture & complexity compliance audit',
    '  aegis mutate <file>                    Run mutation testing gate on target source file',
    '  aegis diff [diff]                      Validate surgical unified diff compliance',
    '  aegis audit <files>                    Run Immutable Oracle trust verification'
  ],
  '🔍 AST, Relational Graph & Codebase Memory': [
    '  aegis find <symbol>                    Fast AST symbol lookup and precision surgical slice',
    '  aegis triage [dir]                     Evidence-Based Bug Triage (zero false alarms)',
    '  aegis trace <target>                   Trace relational callers, signal listeners & blast radius',
    '  aegis graph:scan [dir]                 Build cross-reference relational knowledge graph',
    '  aegis ast:search <pat> [dir]           Structural AST search via ast-grep',
    '  aegis ast:replace <p> <r> <f>          Structural AST replacement via ast-grep',
    '  aegis rtk:compress [file]              Compress terminal/test output via RTK Token Killer',
    '  aegis context7:query <lib> <top>       Query official ground-truth library documentation',
    '  aegis memory:query <symbol>            Query 5-Layer Codebase Memory (AST, Graph, Context7)',
    '  aegis memory:stats [worktree]          Inspect Codebase Memory diagnostics and token savings',
    '  aegis memory:refresh [dir]             Incrementally refresh Codebase Memory cache',
    '  aegis memory:cold-start [dir]          Run full project cold-start AST indexing',
    '  aegis debug [error|file]               Socratic evidence-based interactive debugging session'
  ],
  '🐙 GitHub, Wiki & NotebookLM': [
    '  aegis rfc:triage "<title>" [body]      Triage RFC discussion into actionable issue criteria',
    '  aegis rfc:create "<title>" [desc]      Create architectural RFC & publish Ideation Discussion',
    '  aegis rfc:approve <rfcId>              Approve RFC and synthesize clean-room Wiki architecture',
    '  aegis rfc:decompose <rfcId>            Decompose accepted RFC into atomic GitHub Issues',
    '  aegis gh:status [token]                Inspect live GitHub API connectivity & rate limits',
    '  aegis gh:sync [token]                  Fetch ready issues from GitHub and dispatch to agents',
    '  aegis gh:comment <issue> "<body>"      Post evidence comment to GitHub Issue',
    '  aegis gh:pr <issue> <head> [base]      Open GitHub Pull Request linked to issue',
    '  aegis wiki:list                        List all documentation pages in GitHub Wiki',
    '  aegis wiki:show <page>                 Display rendered Wiki page contents',
    '  aegis wiki:sync                        Auto-sync & push living memory directly to Wiki repo',
    '  aegis nlm:query "<question>" [id]      Query Google NotebookLM with live citations',
    '  aegis nlm:research "<topic>" [--deep]  Run fast or deep research and stage in Wiki/Notebook',
    '  aegis nlm:switch [browser]             Zero-click account switch or re-login with backup',
    '  aegis nlm:sync                         Export and synchronize architecture with NotebookLM'
  ],
  '⚡ Core Workflow & Autocompletion': [
    '  aegis init                             Initialize worktrees and environment',
    '  aegis status                           View worktrees and active file locks',
    '  aegis auto                             Run autonomous task queue & dispatcher',
    '  aegis completion [--install]           Generate or install PowerShell/Bash tab autocompletion',
    '  aegis search <term> | help <term>      Search commands and subcommands by keyword or prefix',
    '  aegis dashboard [port]                 Launch live telemetry Web Dashboard (default port 3000)',
    '  aegis merge <agent> [base]             Multi-tier atomic merge (FF -> Rebase-FF -> Merge Commit)',
    '  aegis branch:sync [agent|--all]        Safely synchronize worktree branches with master',
    '  aegis deps:drift                       Contract Drift Radar & lockfile integrity verification',
    '  aegis deps:sync                        Synchronize and lock dependency baselines to cache'
  ]
};

export const HELP_LINES: readonly string[] = Object.values(HELP_CATEGORIES).flat();

export function filterHelpLines(filter: string): string[] {
  const q = filter.toLowerCase().trim();
  if (!q) return [...HELP_LINES];
  return HELP_LINES.filter(line => line.toLowerCase().includes(q));
}

function printCategorizedHelp(): void {
  for (const [category, lines] of Object.entries(HELP_CATEGORIES)) {
    console.log(`\n${category}:`);
    console.log(lines.join('\n'));
  }
  console.log('\n💡 Search commands: aegis help <filter> | aegis search <term>');
  console.log('⚡ Tab completion:  aegis completion --install\n');
}

export function showHelp(filter?: string): void {
  showBanner();
  const cleanFilter = filter ? filter.trim() : '';
  if (!cleanFilter) {
    printCategorizedHelp();
    return;
  }

  const matches = filterHelpLines(cleanFilter);
  if (matches.length > 0) {
    console.log(`🔍 Aegis Commands matching "${cleanFilter}" (${matches.length} found):\n`);
    console.log(matches.join('\n'));
    console.log('\n💡 Tip: Run "aegis completion --install" to install tab completion in PowerShell.');
  } else {
    console.log(`⚠️  No commands found matching "${cleanFilter}".\n`);
    console.log('Run "aegis help" to see all categorized commands, or "aegis search <term>".');
  }
}
