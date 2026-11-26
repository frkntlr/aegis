/**
 * @file nlm-auth-interactive.ts
 * Interactive terminal challenge resolver and user prompt flows for NotebookLM auth.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as readline from 'node:readline';
import {
  SessionCredentialsManager,
  type AuthChallengeContext,
  type AuthResolutionAction
} from '@aegis/github-live';

export function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function promptInteractiveAuthResolution(
  ctx: AuthChallengeContext,
  runBrowserAuthFn: () => Promise<boolean>,
  runClipboardAuthFn: () => Promise<boolean>
): Promise<AuthResolutionAction> {
  if (!process.stdin.isTTY || process.env.CI) {
    throw new Error(`NotebookLM authentication failed for ${ctx.operation}: ${ctx.errorDetails}. ` +
      'User choice required: reauthenticate, explicitly continue local-only, or cancel.');
  }

  const clip = SessionCredentialsManager.tryExtractFromClipboard();
  console.log('\n⚠️  NotebookLM oturumu bulunamadı veya süresi dolmuş.');
  console.log(` • İşlem: ${ctx.operation}`);
  console.log(` • Detay: ${ctx.errorDetails}`);
  console.log('\n? Ne yapmak istersiniz?');

  if (clip.found && clip.cookies) {
    console.log('  1) (Önerilen) Panodaki (Clipboard) hazır oturumu kullan');
  } else {
    console.log('  1) (Önerilen) Tarayıcıyı açarak NotebookLM\'e giriş yap');
  }
  console.log('  2) Panodan (Clipboard) çerez aktar (--clipboard)');
  console.log('  3) Cookie / cURL komutunu konsola elle yapıştır');
  console.log('  4) NotebookLM olmadan devam et (Yerel AST & Context7 ile)');
  console.log('  5) Görevi iptal et');

  const answer = (await promptUser('Seçiminiz [1/2/3/4/5]: ')).trim();
  return await handlePromptChoice(answer, runBrowserAuthFn, runClipboardAuthFn, clip.found && clip.cookies ? clip.cookies : undefined);
}

export async function handlePromptChoice(
  choice: string,
  runBrowserAuthFn: () => Promise<boolean>,
  runClipboardAuthFn: () => Promise<boolean>,
  clipCookie?: string
): Promise<AuthResolutionAction> {
  if (choice === '1') {
    if (clipCookie) {
      return requireAuthSuccess(SessionCredentialsManager.saveCredentials(clipCookie).success);
    }
    const ok = await runBrowserAuthFn();
    return requireAuthSuccess(ok);
  }
  if (choice === '2') {
    const ok = await runClipboardAuthFn();
    return requireAuthSuccess(ok);
  }
  if (choice === '3') {
    const raw = await promptUser('Lütfen Cookie dizesini veya cURL komutunu yapıştırın: ');
    if (raw && raw.trim().length > 0) {
      return requireAuthSuccess(SessionCredentialsManager.saveCredentials(raw).success);
    }
    return requireAuthSuccess(false);
  }
  if (choice === '5') return 'ABORT';
  if (choice === '4') return 'OFFLINE_FALLBACK';
  throw new Error('Invalid choice. Select reauthentication, explicit local-only continuation (4), or cancellation (5).');
}

function requireAuthSuccess(success: boolean): AuthResolutionAction {
  if (success) return 'REAUTH';
  throw new Error('NotebookLM reauthentication failed. Choose reauthentication, explicit local-only continuation, or cancellation.');
}
