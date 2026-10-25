import * as fs from 'node:fs';
import * as path from 'node:path';
import { GodotTopicResolver, DeprecationLinter, type DeprecationWarning } from '@aegis/shared';
import { DependencyMapper, type DiscoveredDependency } from './dependency-mapper.js';

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
  source: 'builtin' | 'cache' | 'miss';
}

export class Context7Bridge {
  private docs = new Map<string, Context7DocEntry>();

  constructor() {
    this.initBuiltinDocs();
  }

  private initBuiltinDocs(): void {
    this.initGodotDocs();
    this.initGeneralDocs();
  }

  private initGodotDocs(): void {
    this.initGodotCoreDocs();
    this.initGodotFeatureDocs();
  }

  private initGodotCoreDocs(): void {
    this.registerDoc({
      library: 'godot4',
      topic: 'lifecycle',
      version: '4.3',
      summary: 'Godot 4 Node lifecycle and instantiation conventions.',
      signatures: [
        'PackedScene.instantiate() -> Node',
        'Node.queue_free() -> void',
        'Node.is_queued_for_deletion() -> bool'
      ],
      codeExample: 'var inst = scene.instantiate()\nadd_child(inst)',
      breakingChanges: [
        'scene.instance() is deprecated in Godot 4; use scene.instantiate().',
        'Do not use is_instance_valid() as a band-aid; use tree exit hooks or signals.'
      ]
    });

    this.registerDoc({
      library: 'godot4',
      topic: 'signals',
      version: '4.3',
      summary: 'Godot 4 first-class signal and Callable connections.',
      signatures: ['signal_name.emit(...args)', 'signal_name.connect(callable: Callable)'],
      codeExample: 'health_changed.emit(hp, max_hp)\nbutton.pressed.connect(_on_pressed)',
      breakingChanges: ['connect("pressed", self, "_on_pressed") is replaced by button.pressed.connect(_on_pressed).']
    });
  }

  private initGodotFeatureDocs(): void {
    this.registerDoc({
      library: 'godot4',
      topic: 'physics',
      version: '4.3',
      summary: 'Godot 4 CharacterBody2D and kinematics standard.',
      signatures: ['velocity: Vector2', 'move_and_slide() -> bool'],
      codeExample: 'velocity = direction * SPEED\nmove_and_slide()',
      breakingChanges: ['move_and_slide() takes 0 arguments in Godot 4; set self.velocity before calling.']
    });

    this.registerDoc({
      library: 'godot4',
      topic: 'ui',
      version: '4.3',
      summary: 'Godot 4 UI Controls, Containers and Touch Target specifications.',
      signatures: ['custom_minimum_size: Vector2', 'anchors_preset: int'],
      codeExample: 'custom_minimum_size = Vector2(48, 48)',
      breakingChanges: ['Interactive touch elements require at least 48x48px touch targets.']
    });
  }

  private initGeneralDocs(): void {
    this.registerDoc({
      library: 'typescript',
      topic: 'node-test',
      version: '5.5',
      summary: 'Node.js built-in test runner with strict assertions.',
      signatures: ['test(name: string, fn: () => void | Promise<void>)', 'assert.strictEqual(actual, expected)', 'assert.ok(value)'],
      codeExample: 'import { test } from "node:test";\nimport * as assert from "node:assert";'
    });

    this.registerDoc({
      library: 'typescript',
      topic: 'clean-arch',
      version: '5.5',
      summary: 'TypeScript Clean Domain Architecture & Demir Kafes compliance.',
      signatures: ['TS_001_NO_ANY', 'TS_002_EMPTY_CATCH', 'TS_003_NESTING_DEPTH'],
      codeExample: 'try { doTask(); } catch (err) { logger.error(err); }',
      breakingChanges: ['No explicit any. No uncommented swallowed catches. Max nesting depth <= 4.']
    });

    this.registerDoc({
      library: 'aegis',
      topic: 'constitution',
      version: '1.0',
      summary: 'Demir Kafes architectural constraints and multi-agent worktree protocols.',
      signatures: ['Max 300 lines per file', 'Max 40 lines per function', 'Surgical Unified Diffs only']
    });
  }

  private makeKey(lib: string, topic: string): string {
    return `${lib.toLowerCase()}::${topic.toLowerCase()}`;
  }

  public registerDoc(entry: Context7DocEntry): void {
    this.docs.set(this.makeKey(entry.library, entry.topic), entry);
  }

  public query(library: string, topic: string, cacheDir?: string): Context7QueryResult {
    const key = this.makeKey(library, topic);
    const exact = this.docs.get(key);
    if (exact) {
      return { matched: true, doc: exact, source: 'builtin' };
    }

    const libMatch = Array.from(this.docs.values()).find(
      d => d.library.toLowerCase() === library.toLowerCase() && d.topic.toLowerCase().includes(topic.toLowerCase())
    );
    if (libMatch) {
      return { matched: true, doc: libMatch, source: 'builtin' };
    }

    const diskDoc = this.queryDiskCache(library, topic, cacheDir);
    if (diskDoc) {
      this.registerDoc(diskDoc);
      return { matched: true, doc: diskDoc, source: 'cache' };
    }

    return { matched: false, source: 'miss' };
  }

  private queryDiskCache(library: string, topic: string, cacheDir?: string): Context7DocEntry | null {
    const targetDir = cacheDir || path.resolve(process.cwd(), '.aegis', 'cache', 'context7');
    if (!fs.existsSync(targetDir)) return null;
    try {
      const files = fs.readdirSync(targetDir);
      for (const f of files) {
        if (!f.endsWith('.json') || f === 'docs.json') continue;
        if (f.toLowerCase().startsWith(library.toLowerCase())) {
          const entry = JSON.parse(fs.readFileSync(path.join(targetDir, f), 'utf8')) as Context7DocEntry;
          if (entry.library.toLowerCase() === library.toLowerCase() && (!topic || entry.topic.toLowerCase().includes(topic.toLowerCase()))) {
            return entry;
          }
        }
      }
    } catch { /* ignore cache read error */ }
    return null;
  }

  public resolveGodotTopic(codeOrClass: string): 'physics' | 'ui' | 'signals' | 'lifecycle' {
    return GodotTopicResolver.resolveTopic(codeOrClass);
  }

  public queryGodotTopic(codeOrClass: string): Context7QueryResult {
    const topic = this.resolveGodotTopic(codeOrClass);
    return this.query('godot4', topic);
  }

  public lintDeprecations(code: string, ecosystem?: 'godot' | 'typescript'): DeprecationWarning[] {
    return DeprecationLinter.lint(code, ecosystem);
  }

  public syncDependencies(rootDir: string, cacheDir?: string): DiscoveredDependency[] {
    const deps = DependencyMapper.scanWorkspace(rootDir);
    if (cacheDir) this.loadFromCache(cacheDir);
    return deps;
  }

  public saveToCache(cacheDir = path.resolve(process.cwd(), '.aegis', 'cache', 'context7')): void {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const records = Array.from(this.docs.values());
      fs.writeFileSync(path.join(cacheDir, 'docs.json'), JSON.stringify(records, null, 2), 'utf8');
      for (const doc of records) {
        const fname = `${doc.library.toLowerCase()}-${doc.version.toLowerCase().replace(/[^a-z0-9.]/g, '')}.json`;
        fs.writeFileSync(path.join(cacheDir, fname), JSON.stringify(doc, null, 2), 'utf8');
      }
    } catch { /* ignore non-fatal cache write errors */ }
  }

  public loadFromCache(cacheDir = path.resolve(process.cwd(), '.aegis', 'cache', 'context7')): void {
    if (!fs.existsSync(cacheDir)) return;
    try {
      const mainFile = path.join(cacheDir, 'docs.json');
      if (fs.existsSync(mainFile)) {
        const records = JSON.parse(fs.readFileSync(mainFile, 'utf8')) as Context7DocEntry[];
        for (const r of records) this.registerDoc(r);
      }
      const files = fs.readdirSync(cacheDir);
      for (const f of files) {
        if (!f.endsWith('.json') || f === 'docs.json') continue;
        const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')) as Context7DocEntry;
        if (entry.library && entry.topic) this.registerDoc(entry);
      }
    } catch { /* ignore cache read errors */ }
  }

  public injectDocumentationContext(basePrompt: string, targetFiles: string[], codeSnippets: string[] = []): string {
    const snippets: string[] = [];
    const hasGodot = targetFiles.some(f => f.endsWith('.gd') || f.endsWith('.tscn'));
    const hasTs = targetFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    if (hasGodot) {
      const gDoc = this.query('godot4', 'lifecycle');
      const gWarnings = codeSnippets.flatMap(c => this.lintDeprecations(c, 'godot'));
      if (gDoc.doc) snippets.push(this.formatDocSnippet(gDoc.doc, gWarnings));
    }
    if (hasTs) {
      const tDoc = this.query('typescript', 'node-test');
      const tsWarnings = codeSnippets.flatMap(c => this.lintDeprecations(c, 'typescript'));
      if (tDoc.doc) snippets.push(this.formatDocSnippet(tDoc.doc, tsWarnings));
    }

    if (snippets.length === 0) return basePrompt;
    return `${basePrompt}\n\n## 📚 Context7 Ground-Truth Documentation\n${snippets.join('\n\n')}\n`;
  }

  public formatDocSnippet(doc: Context7DocEntry, warnings: DeprecationWarning[] = []): string {
    const sigs = doc.signatures.map(s => `  - \`${s}\``).join('\n');
    const breaks = doc.breakingChanges ? `\n- Breaking Changes:\n${doc.breakingChanges.map(b => `  ⚠️ ${b}`).join('\n')}` : '';
    const activeWarns = warnings.length > 0 ? `\n- Active Deprecation Warnings:\n${warnings.map(w => `  🚨 ${w.message}`).join('\n')}` : '';
    return `### [${doc.library.toUpperCase()} v${doc.version}] ${doc.topic}\n- **Summary:** ${doc.summary}\n- **Key Signatures:**\n${sigs}${breaks}${activeWarns}`;
  }
}
