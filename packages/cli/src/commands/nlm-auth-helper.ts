/**
 * @file nlm-auth-helper.ts
 * Interactive Auth Resolution & Multi-Browser Session Manager for NotebookLM.
 * Handles active session pre-flight, headless rotation, and clipboard instant-import.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  SessionCredentialsManager,
  NativeBrowserCdpAttacher,
  NativeBrowserSpawner,
  HttpRotateEngine,
  MultiRootTokenResolver,
  type AuthChallengeContext,
  type AuthResolutionAction
} from '@aegis/github-live';
import { showBanner } from './banner.js';
import { runZeroClickSessionImport } from './nlm-switch-helper.js';
import {
  promptUser,
  promptInteractiveAuthResolution as runInteractivePrompt
} from './nlm-auth-interactive.js';

export async function handleNlmAuth(...args: string[]): Promise<void> {
  showBanner();
  const isClipboard = args.includes('--clipboard') || args.includes('-c');
  const isRotate = args.includes('--rotate') || args.includes('-r');
  const isPaste = args.includes('--paste') || args.includes('-p');
  const isBrowser = args.includes('--browser') || args.includes('-b');
  const isForce = args.includes('--force') || args.includes('-f');

  if (isClipboard) {
    await runClipboardAuth();
    return;
  }
  if (isRotate) {
    await runRotateAuth();
    return;
  }
  if (isPaste) {
    const rawVal = args.find(a => !a.startsWith('-') && a !== 'auth');
    await runPasteAuth(rawVal);
    return;
  }
  if (isBrowser) {
    await handleBrowserCommand(args, isForce);
    return;
  }
  runStatusCheck();
}

async function handleBrowserCommand(args: string[], isForce: boolean): Promise<void> {
  const inspect = SessionCredentialsManager.inspectCredentials();
  if (inspect.active && !isForce) {
    console.log('✅ Google NotebookLM session is already active and valid!');
    console.log(` • Source: [${inspect.source.toUpperCase()}] (${inspect.path || 'in-memory'})`);
    console.log(` • Binding Token (SID): ${inspect.hasSid ? '✅' : '❌'}`);
    console.log(` • Session Token (__Secure-1PSIDTS): ${inspect.hasPsidts ? '✅' : '❌'}`);
    console.log('\n💡 Session is ready to use without launching a browser.');
    console.log('   To re-authenticate or switch accounts, run:\n   aegis nlm:auth --browser --force');
    return;
  }

  if (inspect.hasSid && !inspect.hasPsidts && !isForce) {
    console.log('🔄 Expired or partial session detected. Attempting headless HTTP rotation...');
    const rotated = await runSilentRotate();
    if (rotated) return;
  }

  const clip = SessionCredentialsManager.tryExtractFromClipboard();
  if (clip.found && clip.cookies && !isForce) {
    console.log('📋 Valid Google cookies detected in clipboard! Importing automatically...');
    const save = SessionCredentialsManager.saveCredentials(clip.cookies);
    if (save.success) {
      console.log(`✅ Session credentials imported from clipboard and saved to: ${save.path}`);
      return;
    }
  }

  if (!isForce) {
    const zeroClick = await runZeroClickSessionImport();
    if (zeroClick) return;
  }

  await launchBrowserFlow(args);
}

async function launchBrowserFlow(args: string[]): Promise<boolean> {
  const browserIdx = args.findIndex(a => a === '--browser' || a === '-b');
  const browserArg = args[browserIdx + 1];
  const preferredName = browserArg && !browserArg.startsWith('-') ? browserArg : undefined;
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 9222;
  return await runBrowserAuth(preferredName, port);
}

export async function runClipboardAuth(): Promise<boolean> {
  console.log('📋 Inspecting system clipboard for Google NotebookLM session cookies...');
  const clip = SessionCredentialsManager.tryExtractFromClipboard();
  if (!clip.found || !clip.cookies) {
    console.error('❌ No valid Google NotebookLM cookies or cURL command found in clipboard.');
    console.log('\n💡 If already logged into NotebookLM in Chrome/Edge/Brave:');
    console.log('   1. In F12 DevTools Console, type: copy(document.cookie) and hit Enter');
    console.log('   2. OR Network tab -> Right click request -> Copy -> Copy as cURL');
    console.log('   3. Run "aegis nlm:auth --clipboard" again.');
    return false;
  }

  const saveRes = SessionCredentialsManager.saveCredentials(clip.cookies);
  if (saveRes.success) {
    console.log(`✅ Session credentials extracted from clipboard and saved to: ${saveRes.path}`);
    return true;
  }
  console.error(`❌ Failed to save credentials: ${saveRes.error}`);
  return false;
}

export async function runSilentRotate(): Promise<boolean> {
  const resolver = MultiRootTokenResolver.resolve();
  if (!resolver.cookies) return false;
  const res = await HttpRotateEngine.rotate(resolver.cookies, { saveOnSuccess: true });
  if (res.success) {
    console.log('✅ Session rotated successfully via headless HTTP! New __Secure-1PSIDTS acquired.');
    return true;
  }
  return false;
}

export async function runRotateAuth(): Promise<void> {
  console.log('🔄 Attempting headless HTTP session rotation with Google accounts...');
  const success = await runSilentRotate();
  if (!success) {
    console.error('❌ Headless rotation failed or binding token (SID) is expired.');
    console.log('💡 Run "aegis nlm:auth --browser" or "aegis nlm:auth --clipboard" to re-authenticate.');
  }
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
    console.log('\n💡 Authentication Options:');
    console.log('   • Account already open in browser? Copy cURL or cookie and run: aegis nlm:auth --clipboard');
    console.log('   • Launch browser: aegis nlm:auth --browser [chrome|edge|brave]');
    console.log('   • Paste cookie directly: aegis nlm:auth --paste "<cookie>"');
  } else {
    console.log('\n💡 Maintenance:');
    console.log('   • Refresh session token: aegis nlm:auth --rotate');
    console.log('   • Force re-login / switch accounts: aegis nlm:auth --browser --force');
  }
}

async function runPasteAuth(providedCookie?: string): Promise<void> {
  let cookieToSave = providedCookie;
  if (!cookieToSave) {
    cookieToSave = await promptUser('Paste raw Cookie header or cURL command: ');
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
    maxWaitMs: 180000,
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
  return await runInteractivePrompt(ctx, () => runBrowserAuth(), () => runClipboardAuth());
}
