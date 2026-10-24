import * as fs from 'node:fs';
import * as path from 'node:path';

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

  public query(library: string, topic: string): Context7QueryResult {
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

    return { matched: false, source: 'miss' };
  }

  public saveToCache(cacheDir = path.resolve(process.cwd(), '.aegis', 'cache', 'context7')): void {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const records = Array.from(this.docs.values());
      fs.writeFileSync(path.join(cacheDir, 'docs.json'), JSON.stringify(records, null, 2), 'utf8');
    } catch { /* ignore non-fatal cache write errors */ }
  }

  public loadFromCache(cacheDir = path.resolve(process.cwd(), '.aegis', 'cache', 'context7')): void {
    const file = path.join(cacheDir, 'docs.json');
    if (!fs.existsSync(file)) return;
    try {
      const records = JSON.parse(fs.readFileSync(file, 'utf8')) as Context7DocEntry[];
      for (const r of records) this.registerDoc(r);
    } catch { /* ignore cache read errors */ }
  }

  public injectDocumentationContext(basePrompt: string, targetFiles: string[]): string {
    const snippets: string[] = [];
    const hasGodot = targetFiles.some(f => f.endsWith('.gd') || f.endsWith('.tscn'));
    const hasTs = targetFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    if (hasGodot) {
      const gDoc = this.query('godot4', 'lifecycle');
      if (gDoc.doc) snippets.push(this.formatDocSnippet(gDoc.doc));
    }
    if (hasTs) {
      const tDoc = this.query('typescript', 'node-test');
      if (tDoc.doc) snippets.push(this.formatDocSnippet(tDoc.doc));
    }

    if (snippets.length === 0) return basePrompt;
    return `${basePrompt}\n\n## 📚 Context7 Ground-Truth Documentation\n${snippets.join('\n\n')}\n`;
  }

  private formatDocSnippet(doc: Context7DocEntry): string {
    const sigs = doc.signatures.map(s => `  - \`${s}\``).join('\n');
    const breaks = doc.breakingChanges ? `\n- Breaking Changes:\n${doc.breakingChanges.map(b => `  ⚠️ ${b}`).join('\n')}` : '';
    return `### [${doc.library.toUpperCase()} v${doc.version}] ${doc.topic}\n- **Summary:** ${doc.summary}\n- **Key Signatures:**\n${sigs}${breaks}`;
  }
}
