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
    console.log(`⚠️  Non-interactive environment: defaulting to OFFLINE_FALLBACK for ${ctx.operation}`);
    return 'OFFLINE_FALLBACK';
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

async function handlePromptChoice(
  choice: string,
  runBrowserAuthFn: () => Promise<boolean>,
  runClipboardAuthFn: () => Promise<boolean>,
  clipCookie?: string
): Promise<AuthResolutionAction> {
  if (choice === '1') {
    if (clipCookie) {
      SessionCredentialsManager.saveCredentials(clipCookie);
      return 'REAUTH';
    }
    const ok = await runBrowserAuthFn();
    return ok ? 'REAUTH' : 'OFFLINE_FALLBACK';
  }
  if (choice === '2') {
    const ok = await runClipboardAuthFn();
    return ok ? 'REAUTH' : 'OFFLINE_FALLBACK';
  }
  if (choice === '3') {
    const raw = await promptUser('Lütfen Cookie dizesini veya cURL komutunu yapıştırın: ');
    if (raw && raw.trim().length > 0) {
      SessionCredentialsManager.saveCredentials(raw);
      return 'REAUTH';
    }
    return 'OFFLINE_FALLBACK';
  }
  if (choice === '5') return 'ABORT';
  return 'OFFLINE_FALLBACK';
}
