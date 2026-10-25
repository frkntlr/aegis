export interface DeprecationWarning {
  code: string;
  message: string;
  suggestedFix?: string;
  line?: number;
}

interface LintRule {
  pattern: RegExp;
  code: string;
  message: string;
  suggestedFix: string;
}

const GODOT_RULES: LintRule[] = [
  {
    pattern: /\binstance\s*\(/,
    code: 'GD_DEP_001',
    message: "BREAKING: Godot 4'te scene.instance() kaldırılmıştır; scene.instantiate() kullanılmalıdır.",
    suggestedFix: 'instantiate()'
  },
  {
    pattern: /\bmove_and_slide\s*\(\s*[^)\s]/,
    code: 'GD_DEP_002',
    message: "BREAKING: Godot 4'te move_and_slide() parametre almaz; self.velocity ayarlanmalıdır.",
    suggestedFix: 'self.velocity = ...; move_and_slide()'
  },
  {
    pattern: /\.connect\s*\(\s*["'][^"']+["']\s*,\s*(?:self|this)/,
    code: 'GD_DEP_003',
    message: "BREAKING: Godot 4 Callable bağlantısı zorunludur: button.pressed.connect(_on_pressed).",
    suggestedFix: 'signal.connect(callable)'
  },
  {
    pattern: /\byield\s*\(/,
    code: 'GD_DEP_004',
    message: "BREAKING: Godot 4'te yield() kaldırılmıştır; await kullanılmalıdır.",
    suggestedFix: 'await get_tree().create_timer(1.0).timeout'
  }
];

const TS_RULES: LintRule[] = [
  {
    pattern: /:\s*any\b|as\s+any\b|<any>/,
    code: 'TS_DEP_001',
    message: 'BREAKING: Açık any kullanımı yasaktır; unknown ve tip koruması (Type Guard/Zod) kullanılmalıdır.',
    suggestedFix: 'unknown'
  },
  {
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
    code: 'TS_DEP_002',
    message: 'BREAKING: Boş catch bloğu yasaktır; hata loglanmalı veya fırlatılmalıdır.',
    suggestedFix: 'catch (err) { logger.error(err); }'
  }
];

export class DeprecationLinter {
  private static scanLines(lines: string[], rules: LintRule[], commentRegex: RegExp): DeprecationWarning[] {
    const warnings: DeprecationWarning[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      if (commentRegex.test(lineText)) continue;
      for (const rule of rules) {
        if (rule.pattern.test(lineText)) {
          warnings.push({
            code: rule.code,
            message: rule.message,
            suggestedFix: rule.suggestedFix,
            line: i + 1
          });
        }
      }
    }
    return warnings;
  }

  public static lintGodot(code: string): DeprecationWarning[] {
    return DeprecationLinter.scanLines(code.split('\n'), GODOT_RULES, /^\s*#/);
  }

  public static lintTypeScript(code: string): DeprecationWarning[] {
    return DeprecationLinter.scanLines(code.split('\n'), TS_RULES, /^\s*(?:\/\/|\/\*|\*)/);
  }

  public static lint(code: string, ecosystem?: 'godot' | 'typescript'): DeprecationWarning[] {
    if (ecosystem === 'godot') return DeprecationLinter.lintGodot(code);
    if (ecosystem === 'typescript') return DeprecationLinter.lintTypeScript(code);
    return [...DeprecationLinter.lintGodot(code), ...DeprecationLinter.lintTypeScript(code)];
  }
}
