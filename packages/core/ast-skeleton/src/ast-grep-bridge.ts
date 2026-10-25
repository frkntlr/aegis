import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface AstGrepMatch {
  file?: string;
  startLine: number;
  endLine: number;
  matchedText: string;
  metavars: Record<string, string>;
}

export interface AstGrepReplaceResult {
  transformed: string;
  matchCount: number;
  hasChanges: boolean;
  matches: AstGrepMatch[];
}

export interface AstGrepRule {
  id: string;
  message: string;
  pattern: string;
  severity: 'error' | 'warning' | 'info';
}

export interface AstGrepLintMatch {
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  startLine: number;
  endLine: number;
  matchedText: string;
}

export class AstGrepBridge {
  private static parsePattern(pattern: string): { regex: RegExp; varNames: string[] } {
    const varNames: string[] = [];
    let p = pattern.replace(/[.*+?^${}()|[\]\\]/g, (m) => {
      if (m === '$') return '$';
      return '\\' + m;
    });

    p = p.replace(/\$\$\$([a-zA-Z_]\w*)/g, (_, name) => {
      varNames.push(name);
      return `(?<${name}>[\\s\\S]*?)`;
    });

    p = p.replace(/\$([a-zA-Z_]\w*)/g, (_, name) => {
      varNames.push(name);
      return `(?<${name}>(?:"[^"]*"|'[^']*'|[^,();\n]+?))`;
    });

    const normalized = p.replace(/\s+/g, '\\s+');
    return { regex: new RegExp(normalized, 'g'), varNames };
  }

  public static find(content: string, pattern: string): AstGrepMatch[] {
    const matches: AstGrepMatch[] = [];
    const { regex, varNames } = AstGrepBridge.parsePattern(pattern);
    let m: RegExpExecArray | null;

    while ((m = regex.exec(content)) !== null) {
      const matchIndex = m.index;
      const matchedText = m[0];
      const startLine = content.slice(0, matchIndex).split(/\r?\n/).length;
      const endLine = content.slice(0, matchIndex + matchedText.length).split(/\r?\n/).length;
      const metavars: Record<string, string> = {};

      if (m.groups) {
        for (const name of varNames) {
          if (m.groups[name] !== undefined) {
            metavars[name] = m.groups[name];
          }
        }
      }

      matches.push({ startLine, endLine, matchedText, metavars });
    }
    return matches;
  }

  public static replace(content: string, pattern: string, rewrite: string): AstGrepReplaceResult {
    const matches = AstGrepBridge.find(content, pattern);
    if (matches.length === 0) {
      return { transformed: content, matchCount: 0, hasChanges: false, matches: [] };
    }

    const { regex, varNames } = AstGrepBridge.parsePattern(pattern);
    const transformed = content.replace(regex, (...args) => {
      const groups = args[args.length - 1] as Record<string, string> | undefined;
      let out = rewrite;
      if (groups) {
        for (const name of varNames) {
          const val = groups[name] ?? '';
          out = out.replace(new RegExp(`\\$\\$?\\$?${name}\\b`, 'g'), val);
        }
      }
      return out;
    });

    return {
      transformed,
      matchCount: matches.length,
      hasChanges: transformed !== content,
      matches
    };
  }

  public static lint(content: string, rules: AstGrepRule[]): AstGrepLintMatch[] {
    const lintMatches: AstGrepLintMatch[] = [];
    for (const rule of rules) {
      const found = AstGrepBridge.find(content, rule.pattern);
      for (const f of found) {
        lintMatches.push({
          ruleId: rule.id,
          message: rule.message,
          severity: rule.severity,
          startLine: f.startLine,
          endLine: f.endLine,
          matchedText: f.matchedText
        });
      }
    }
    return lintMatches;
  }

  public static searchFile(filePath: string, pattern: string): AstGrepMatch[] {
    if (!fs.existsSync(filePath)) return [];
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = AstGrepBridge.find(content, pattern);
      return matches.map(m => ({ ...m, file: filePath.replace(/\\/g, '/') }));
    } catch {
      return [];
    }
  }

  public static searchDirectory(dirPath: string, pattern: string, ext = ['.ts', '.gd', '.py', '.rs', '.go']): AstGrepMatch[] {
    const allMatches: AstGrepMatch[] = [];
    if (!fs.existsSync(dirPath)) return allMatches;

    const scan = (cur: string) => {
      const entries = fs.readdirSync(cur, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '.git', 'dist', '.aegis'].includes(e.name)) {
            scan(full);
          }
        } else if (e.isFile() && ext.some(x => e.name.endsWith(x))) {
          allMatches.push(...AstGrepBridge.searchFile(full, pattern));
        }
      }
    };

    scan(dirPath);
    return allMatches;
  }

  public static replaceInFile(filePath: string, pattern: string, rewrite: string): AstGrepReplaceResult & { written: boolean } {
    if (!fs.existsSync(filePath)) {
      return { transformed: '', matchCount: 0, hasChanges: false, matches: [], written: false };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const result = AstGrepBridge.replace(content, pattern, rewrite);
    if (result.hasChanges) {
      fs.writeFileSync(filePath, result.transformed, 'utf8');
    }
    return { ...result, written: result.hasChanges };
  }

  public static checkCliAvailable(): boolean {
    const res = spawnSync('sg', ['--version'], { encoding: 'utf8', shell: true });
    return res.status === 0;
  }

  public static runCli(args: string[], cwd = process.cwd()): string | null {
    if (!AstGrepBridge.checkCliAvailable()) return null;
    const res = spawnSync('sg', args, { cwd, encoding: 'utf8', shell: true });
    return res.stdout || res.stderr || '';
  }
}
