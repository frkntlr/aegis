/**
 * @file nlm-session-helpers.ts
 * Leaf helpers for NotebookLM browser CDP auth and zero-click ambient session import.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  AmbientCdpScanner,
  AmbientCookieVaultExtractor,
  NativeBrowserCdpAttacher,
  NativeBrowserSpawner,
  SessionCredentialsManager
} from '@aegis/github-live';

export async function runZeroClickSessionImport(): Promise<boolean> {
  console.log('🔍 Checking running browsers and profile vaults for active Google session...');

  const cdpRes = await AmbientCdpScanner.discoverAndHarvest();
  if (cdpRes.success && cdpRes.cookies) {
    SessionCredentialsManager.saveCredentials(cdpRes.cookies);
    console.log(`✅ Zero-Click Session Detected on CDP port ${cdpRes.port} (${cdpRes.matchedUrl})!`);
    console.log('   Saved session credentials without manual entry.');
    return true;
  }

  const vaultRes = AmbientCookieVaultExtractor.extractFromAllVaults();
  if (vaultRes.success && vaultRes.cookies) {
    SessionCredentialsManager.saveCredentials(vaultRes.cookies);
    console.log(`✅ Zero-Click Session Extracted from ${vaultRes.browser?.toUpperCase()} profile vault!`);
    console.log('   Saved session credentials without manual entry.');
    return true;
  }

  return false;
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
