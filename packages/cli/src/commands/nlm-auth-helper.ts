/**
 * @file nlm-auth-helper.ts
 * Interactive Auth Resolution & TTY Prompt Helper for NotebookLM.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as readline from 'node:readline';
import {
  SessionCredentialsManager,
  NativeBrowserCdpAttacher,
  NativeBrowserSpawner,
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
    const browserIdx = args.findIndex(a => a === '--browser' || a === '-b');
    const browserArg = args[browserIdx + 1];
    const preferredName = browserArg && !browserArg.startsWith('-') ? browserArg : undefined;
    await runBrowserAuth(preferredName);
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
    console.log('\n💡 To authenticate, run:\n   aegis nlm:auth --browser [chrome|edge|brave]\n   or paste cookie directly: aegis nlm:auth --paste "<cookie>"');
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

export async function runBrowserAuth(preferredName?: string, port = 9222): Promise<boolean> {
  console.log('🌐 Checking system browser CDP interface on port ' + port + '...');
  const isRunning = await NativeBrowserCdpAttacher.isCdpActive(port);

  if (!isRunning) {
    console.log('🚀 Spawning Chromium-family browser with isolated user-data-dir...');
    const spawnRes = NativeBrowserSpawner.spawn({ browserName: preferredName, port });
    if (!spawnRes.success) {
      console.error(`❌ ${spawnRes.error || 'Failed to spawn browser.'}`);
      return false;
    }
    console.log(` • Browser: ${spawnRes.browser?.name.toUpperCase()} (PID: ${spawnRes.pid || 'attached'})`);
    console.log(` • Isolated Profile: ${spawnRes.userDataDir}`);
    console.log('⏳ Waiting for browser CDP debugging interface to bind...');

    const ready = await NativeBrowserCdpAttacher.waitForCdp(port, '127.0.0.1', 20000);
    if (!ready) {
      console.error('❌ Browser process started but CDP port ' + port + ' timed out.');
      return false;
    }
  }

  return await executeHarvestWorkflow(port);
}

async function executeHarvestWorkflow(port: number): Promise<boolean> {
  console.log('🔑 Waiting for Google NotebookLM session (sign in if prompted in browser)...');
  const harvest = await NativeBrowserCdpAttacher.harvestSessionCookies({
    port,
    maxWaitMs: 90000,
    pollIntervalMs: 1500,
    autoClose: true
  });

  if (!harvest.success || !harvest.cookies) {
    console.error(`❌ Authentication capture failed: ${harvest.error || 'No cookies received.'}`);
    return false;
  }

  const saveRes = SessionCredentialsManager.saveCredentials(harvest.cookies);
  if (saveRes.success) {
    console.log(`✅ NotebookLM session captured and saved successfully to: ${saveRes.path}`);
    return true;
  }

  console.error(`❌ Failed to persist captured session credentials: ${saveRes.error}`);
  return false;
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
  console.log('  1) (Önerilen) Tarayıcıyı açarak NotebookLM\'e giriş yap');
  console.log('  2) Cookie dizesini elle yapıştır');
  console.log('  3) NotebookLM olmadan devam et (Yerel AST & Context7 ile)');
  console.log('  4) Görevi iptal et');

  const answer = (await promptUser('Seçiminiz [1/2/3/4]: ')).trim();
  if (answer === '1') {
    const ok = await runBrowserAuth();
    return ok ? 'REAUTH' : 'OFFLINE_FALLBACK';
  }
  if (answer === '2') {
    const raw = await promptUser('Lütfen güncel Cookie dizesini yapıştırın: ');
    if (raw && raw.trim().length > 0) {
      SessionCredentialsManager.saveCredentials(raw);
      return 'REAUTH';
    }
    return 'OFFLINE_FALLBACK';
  }
  if (answer === '4') return 'ABORT';
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
