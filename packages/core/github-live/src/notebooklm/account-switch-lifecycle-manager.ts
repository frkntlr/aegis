/**
 * @file account-switch-lifecycle-manager.ts
 * Account Switching Lifecycle Manager & Session Backup Engine for Google NotebookLM.
 * Manages zero-friction session transitions, automated backups, and cache eviction.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SessionCredentialsManager } from './session-credentials-manager.js';
import { AmbientCdpScanner } from './ambient-cdp-scanner.js';
import { AmbientCookieVaultExtractor } from './ambient-cookie-vault-extractor.js';

export interface SwitchResult {
  success: boolean;
  method: 'zero_click_cdp' | 'zero_click_vault' | 'needs_browser_flow';
  backupPath?: string;
  source?: string;
  cookies?: string;
  error?: string;
}

export interface SwitchOptions {
  preserveBackup?: boolean;
  preferredBrowser?: string;
  storePath?: string;
  cdpHarvester?: () => Promise<{ success: boolean; cookies?: string; matchedUrl?: string }>;
  vaultHarvester?: () => Promise<{ success: boolean; cookies?: string; browser?: string }>;
}

export class AccountSwitchLifecycleManager {
  public static archiveCurrentSession(storePath = SessionCredentialsManager.resolveDefaultStorePath()): string | null {
    if (!fs.existsSync(storePath)) return null;

    try {
      const dir = path.dirname(storePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(dir, `auth.backup-${timestamp}.json`);
      fs.copyFileSync(storePath, backupPath);
      return backupPath;
    } catch {
      return null;
    }
  }

  public static invalidateActiveSession(storePath = SessionCredentialsManager.resolveDefaultStorePath()): boolean {
    if (!fs.existsSync(storePath)) return true;
    try {
      fs.unlinkSync(storePath);
      return true;
    } catch {
      return false;
    }
  }

  public static restoreArchivedSession(backupPath: string, targetPath = SessionCredentialsManager.resolveDefaultStorePath()): boolean {
    if (!fs.existsSync(backupPath)) return false;
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(backupPath, targetPath);
      return true;
    } catch {
      return false;
    }
  }

  public static listBackups(storeDir = path.dirname(SessionCredentialsManager.resolveDefaultStorePath())): string[] {
    if (!fs.existsSync(storeDir)) return [];
    try {
      return fs
        .readdirSync(storeDir)
        .filter(f => f.startsWith('auth.backup-') && f.endsWith('.json'))
        .sort()
        .reverse()
        .map(f => path.join(storeDir, f));
    } catch {
      return [];
    }
  }

  public static async executeSwitch(options: SwitchOptions = {}): Promise<SwitchResult> {
    const storePath = options.storePath || SessionCredentialsManager.resolveDefaultStorePath();
    const backupPath = options.preserveBackup !== false ? AccountSwitchLifecycleManager.archiveCurrentSession(storePath) : undefined;

    AccountSwitchLifecycleManager.invalidateActiveSession(storePath);

    // Tier 1: Probe open running Google tabs via ambient CDP
    const cdpFn = options.cdpHarvester || (() => AmbientCdpScanner.discoverAndHarvest());
    const cdpRes = await cdpFn();
    if (cdpRes.success && cdpRes.cookies) {
      SessionCredentialsManager.saveCredentials(cdpRes.cookies, storePath);
      return { success: true, method: 'zero_click_cdp', backupPath: backupPath || undefined, source: cdpRes.matchedUrl, cookies: cdpRes.cookies };
    }

    // Tier 2: Extract from local Chromium profile vaults (Edge / Brave / Chrome)
    const vaultFn = options.vaultHarvester || (async () => AmbientCookieVaultExtractor.extractFromAllVaults());
    const vaultRes = await vaultFn();
    if (vaultRes.success && vaultRes.cookies) {
      SessionCredentialsManager.saveCredentials(vaultRes.cookies, storePath);
      return { success: true, method: 'zero_click_vault', backupPath: backupPath || undefined, source: vaultRes.browser, cookies: vaultRes.cookies };
    }

    // Tier 3: Requires user-guided or spawned browser flow
    return {
      success: false,
      method: 'needs_browser_flow',
      backupPath: backupPath || undefined,
      error: 'Zero-click extraction found no open Google sessions in running browsers or vaults.'
    };
  }
}
