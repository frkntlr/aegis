/**
 * @file nlm-switch-helper.ts
 * Command handler for aegis nlm:switch & Zero-Click Ambient Session Importer.
 * Handles autonomous session archiving, zero-click harvesting, and conversational re-auth.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { AccountSwitchLifecycleManager } from '@aegis/github-live';
import { showBanner } from './banner.js';
import { runBrowserAuth } from './nlm-session-helpers.js';

export { runZeroClickSessionImport } from './nlm-session-helpers.js';

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
