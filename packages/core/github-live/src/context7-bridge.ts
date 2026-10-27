import * as fs from 'node:fs';
import * as path from 'node:path';
import { GodotTopicResolver, DeprecationLinter, type DeprecationWarning } from '@aegis/shared';
import { DependencyMapper, type DiscoveredDependency } from './dependency-mapper.js';
import { Context7Registry } from './context7-registry.js';
import { JitDocSynthesizer } from './jit-doc-synthesizer.js';
import { Context7BuiltinDocs } from './context7-builtin-docs.js';

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
  source: 'builtin' | 'cache' | 'miss' | 'jit';
}

export class Context7Bridge {
  private docs = new Map<string, Context7DocEntry>();

  constructor() {
    this.initBuiltinDocs();
  }

  private initBuiltinDocs(): void {
    for (const doc of Context7BuiltinDocs.getBuiltinDocs()) {
      this.registerDoc(doc);
    }
    Context7Registry.registerAll(doc => this.registerDoc(doc));
  }

  private static findRepoRoot(start = process.cwd()): string {
    let cur = path.resolve(start);
    while (cur) {
      if (fs.existsSync(path.join(cur, '.git')) || fs.existsSync(path.join(cur, '.aegis'))) return cur;
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return start;
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

    const jitDoc = JitDocSynthesizer.synthesizeFromNodeModules(library, topic, undefined, cacheDir);
    if (jitDoc) {
      this.registerDoc(jitDoc);
      return { matched: true, doc: jitDoc, source: 'jit' };
    }

    return { matched: false, source: 'miss' };
  }

  private queryDiskCache(library: string, topic: string, cacheDir?: string): Context7DocEntry | null {
    const targetDir = cacheDir || path.resolve(Context7Bridge.findRepoRoot(), '.aegis', 'cache', 'context7');
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
