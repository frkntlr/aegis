/**
 * @file nlm-switch-helper.ts
 * Command handler for aegis nlm:switch & Zero-Click Ambient Session Importer.
 * Handles autonomous session archiving, zero-click harvesting, and conversational re-auth.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  AccountSwitchLifecycleManager,
  AmbientCdpScanner,
  AmbientCookieVaultExtractor,
  SessionCredentialsManager
} from '@aegis/github-live';
import { showBanner } from './banner.js';
import { runBrowserAuth } from './nlm-auth-helper.js';

export async function handleNlmSwitch(...args: string[]): Promise<void> {
  showBanner();
  console.log('🔄 Initiating Google NotebookLM Account Switch Workflow...');

  const preferredBrowser = args.find(a => !a.startsWith('-') && a !== 'switch');
  const res = await AccountSwitchLifecycleManager.executeSwitch({ preferredBrowser });

  if (res.backupPath) {
    console.log(`📦 Previous session archived safely to:\n   ${res.backupPath}`);
  }

  if (res.success) {
    const src = res.method === 'zero_click_cdp' ? `CDP [${res.source}]` : `Browser Vault [${res.source?.toUpperCase()}]`;
    console.log(`\n🎉 Zero-Click Switch Succeeded!`);
    console.log(`✅ Session tokens automatically imported from: ${src}`);
    return;
  }

  console.log('\n🌐 No ambient open session detected in running browsers.');
  console.log('🚀 Spawning browser window for new account authentication...');
  const ok = await runBrowserAuth(preferredBrowser);
  if (ok) {
    console.log('✅ Successfully authenticated and connected to new account.');
  } else {
    console.error('❌ Account switch could not be completed.');
  }
}

export async function runZeroClickSessionImport(): Promise<boolean> {
  console.log('🔍 Checking running browsers and profile vaults for active Google session...');

  // Step 1: Probe open Google tabs via ambient CDP ports
  const cdpRes = await AmbientCdpScanner.discoverAndHarvest();
  if (cdpRes.success && cdpRes.cookies) {
    SessionCredentialsManager.saveCredentials(cdpRes.cookies);
    console.log(`✅ Zero-Click Session Detected on CDP port ${cdpRes.port} (${cdpRes.matchedUrl})!`);
    console.log('   Saved session credentials without manual entry.');
    return true;
  }

  // Step 2: Extract from local Chromium vaults (Edge / Brave / Chrome)
  const vaultRes = AmbientCookieVaultExtractor.extractFromAllVaults();
  if (vaultRes.success && vaultRes.cookies) {
    SessionCredentialsManager.saveCredentials(vaultRes.cookies);
    console.log(`✅ Zero-Click Session Extracted from ${vaultRes.browser?.toUpperCase()} profile vault!`);
    console.log(`   Saved session credentials without manual entry.`);
    return true;
  }

  return false;
}
