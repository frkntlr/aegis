/**
 * @file nlm-auth-helper.ts
 * Interactive Auth Resolution & TTY Prompt Helper for NotebookLM.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as readline from 'node:readline';
import {
  SessionCredentialsManager,
  NativeBrowserCdpAttacher,
  type AuthChallengeContext,
  type AuthResolutionAction
} from '@aegis/github-live';
import { showBanner } from './banner.js';

export async function handleNlmAuth(...args: string[]): Promise<void> {
  showBanner();
  const isPaste = args.includes('--paste') || args.includes('-p');
  const isBrowser = args.includes('--browser') || args.includes('-b');

  if (isPaste) {
    const rawVal = args.find(a => !a.startsWith('-') && a !== 'auth');
    await runPasteAuth(rawVal);
    return;
  }

  if (isBrowser) {
    await runBrowserAuth();
    return;
  }

  runStatusCheck();
}

function runStatusCheck(): void {
  console.log('🔍 Inspecting Google NotebookLM Authentication Credentials...');
  const res = SessionCredentialsManager.inspectCredentials();

  console.log(` • Active Session: ${res.active ? '✅ YES' : '❌ NO'}`);
  console.log(` • Credential Source: [${res.source.toUpperCase()}]`);
  console.log(` • Binding Token (SID): ${res.hasSid ? '✅ Present' : '❌ Missing'}`);
  console.log(` • Session Token (__Secure-1PSIDTS): ${res.hasPsidts ? '✅ Present' : '❌ Missing'}`);
  if (res.path) console.log(` • Storage Path: ${res.path}`);

  if (!res.active) {
    console.log('\n💡 To authenticate, run:\n   aegis nlm:auth --paste "<cookie>"\n   or launch Chrome/Edge with: --remote-debugging-port=9222 and run: aegis nlm:auth --browser');
  }
}

async function runPasteAuth(providedCookie?: string): Promise<void> {
  let cookieToSave = providedCookie;
  if (!cookieToSave) {
    cookieToSave = await promptUser('Paste raw Cookie header: ');
  }

  if (!cookieToSave || cookieToSave.trim().length === 0) {
    console.error('❌ No cookie provided. Aborting.');
    return;
  }

  const res = SessionCredentialsManager.saveCredentials(cookieToSave);
  if (res.success) {
    console.log(`✅ NotebookLM session credentials saved successfully to: ${res.path}`);
  } else {
    console.error(`❌ Failed to save credentials: ${res.error}`);
  }
}

async function runBrowserAuth(): Promise<void> {
  console.log('🌐 Connecting to system browser via Chrome DevTools Protocol (CDP port 9222)...');
  const active = await NativeBrowserCdpAttacher.isCdpActive(9222);
  if (!active) {
    console.error('❌ No browser detected on port 9222.');
    console.log('💡 Start Chrome or Edge with:\n   msedge.exe --remote-debugging-port=9222\n   or chrome.exe --remote-debugging-port=9222\n   then log into https://notebooklm.google.com and retry: aegis nlm:auth --browser');
    return;
  }

  try {
    const cookies = await NativeBrowserCdpAttacher.queryCookies({ port: 9222 });
    if (!cookies) {
      console.error('❌ Could not retrieve cookies from browser on port 9222.');
      return;
    }
    const res = SessionCredentialsManager.saveCredentials(cookies);
    if (res.success) {
      console.log(`✅ Captured and saved browser session credentials to: ${res.path}`);
    } else {
      console.error(`❌ Invalid session extracted from browser: ${res.error}`);
    }
  } catch (err: unknown) {
    console.error(`❌ Browser CDP connection failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function promptInteractiveAuthResolution(ctx: AuthChallengeContext): Promise<AuthResolutionAction> {
  if (!process.stdin.isTTY || process.env.CI) {
    console.log(`⚠️  Non-interactive environment: defaulting to OFFLINE_FALLBACK for ${ctx.operation}`);
    return 'OFFLINE_FALLBACK';
  }

  console.log('\n⚠️  NotebookLM oturumu bulunamadı veya süresi dolmuş.');
  console.log(` • İşlem: ${ctx.operation}`);
  console.log(` • Detay: ${ctx.errorDetails}`);
  console.log('\n? Ne yapmak istersiniz?');
  console.log('  1) (Önerilen) NotebookLM\'e tekrar giriş yap / oturumu yenile');
  console.log('  2) NotebookLM olmadan devam et (Yerel AST & Context7 ile)');
  console.log('  3) Görevi iptal et');

  const answer = (await promptUser('Seçiminiz [1/2/3]: ')).trim();
  if (answer === '1') {
    const raw = await promptUser('Lütfen güncel Cookie dizesini yapıştırın: ');
    if (raw && raw.trim().length > 0) {
      SessionCredentialsManager.saveCredentials(raw);
      return 'REAUTH';
    }
    return 'OFFLINE_FALLBACK';
  }
  if (answer === '3') return 'ABORT';
  return 'OFFLINE_FALLBACK';
}

function promptUser(query: string): Promise<string> {
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
