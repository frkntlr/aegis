/**
 * @file conversational-intent-detector.ts
 * Natural Language Conversational Intent Recognition for NotebookLM Authentication & Account Switching.
 * Detects user intent to switch accounts, reset sessions, or force re-authentication from natural dialogue.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export type NlmIntentType = 'ACCOUNT_SWITCH' | 'SESSION_RESET' | 'FORCE_REAUTH' | 'AUTH_STATUS' | 'NONE';

export interface DetectedIntent {
  type: NlmIntentType;
  matched: boolean;
  confidence: number;
  rawPrompt: string;
  preferredBrowser?: string;
  suggestedAction: string;
}

const SWITCH_PATTERNS = [
  /(?:başka|farklı|yeni)\s+(?:bir\s+)?(?:hesap|hesab|oturum)/i,
  /hesap\s+değiştir/i,
  /hesabı\s+değiştir/i,
  /(?:başka|farklı)\s+hesab[a-z]*\s+(?:geç|bağlan|gir)/i,
  /switch\s+(?:to\s+)?(?:another\s+)?(?:account|google|user)/i,
  /change\s+account/i,
  /use\s+(?:another|different)\s+account/i
];

const RESET_PATTERNS = [
  /(?:oturum|hesap|hesab|çerez|auth)\s*(?:u|umu|ları)?\s*(?:sıfırla|kapat|temizle|sil)/i,
  /çıkış\s*yap/i,
  /log\s*out/i,
  /sign\s*out/i,
  /reset\s*session/i,
  /clear\s*(?:auth|credentials|cookies)/i
];

const REAUTH_PATTERNS = [
  /(?:tekrar|yeniden)\s*(?:giriş\s*yap|bağlan|yetkilendir)/i,
  /oturum(?:u|umu|um)?\s*yenile/i,
  /force\s*(?:re-?auth|login|refresh)/i,
  /re-?authenticate/i
];

const STATUS_PATTERNS = [
  /(?:hesap|oturum|auth)\s*(?:durum|açık\s*mı|kontrol)/i,
  /check\s*(?:auth|login|session|credentials)/i
];

export class ConversationalIntentDetector {
  public static detect(prompt: string): DetectedIntent {
    if (!prompt || typeof prompt !== 'string') {
      return ConversationalIntentDetector.buildResult('NONE', false, 0, '', 'none');
    }

    const trimmed = prompt.trim();
    const browser = ConversationalIntentDetector.extractBrowserPreference(trimmed);

    if (ConversationalIntentDetector.matchesAny(trimmed, SWITCH_PATTERNS)) {
      return ConversationalIntentDetector.buildResult('ACCOUNT_SWITCH', true, 0.95, trimmed, 'execute_account_switch', browser);
    }

    if (ConversationalIntentDetector.matchesAny(trimmed, RESET_PATTERNS)) {
      return ConversationalIntentDetector.buildResult('SESSION_RESET', true, 0.92, trimmed, 'reset_session', browser);
    }

    if (ConversationalIntentDetector.matchesAny(trimmed, REAUTH_PATTERNS)) {
      return ConversationalIntentDetector.buildResult('FORCE_REAUTH', true, 0.90, trimmed, 'force_reauth', browser);
    }

    if (ConversationalIntentDetector.matchesAny(trimmed, STATUS_PATTERNS)) {
      return ConversationalIntentDetector.buildResult('AUTH_STATUS', true, 0.85, trimmed, 'check_auth_status', browser);
    }

    return ConversationalIntentDetector.buildResult('NONE', false, 0, trimmed, 'none', browser);
  }

  public static isAccountSwitchIntent(prompt: string): boolean {
    const res = ConversationalIntentDetector.detect(prompt);
    return res.type === 'ACCOUNT_SWITCH';
  }

  public static extractBrowserPreference(prompt: string): string | undefined {
    const lower = prompt.toLowerCase();
    if (lower.includes('chrome')) return 'chrome';
    if (lower.includes('edge')) return 'edge';
    if (lower.includes('brave')) return 'brave';
    if (lower.includes('vivaldi')) return 'vivaldi';
    if (lower.includes('opera')) return 'opera';
    return undefined;
  }

  private static matchesAny(text: string, patterns: RegExp[]): boolean {
    return patterns.some(p => p.test(text));
  }

  private static buildResult(
    type: NlmIntentType,
    matched: boolean,
    confidence: number,
    rawPrompt: string,
    suggestedAction: string,
    preferredBrowser?: string
  ): DetectedIntent {
    return {
      type,
      matched,
      confidence,
      rawPrompt,
      preferredBrowser,
      suggestedAction
    };
  }
}
