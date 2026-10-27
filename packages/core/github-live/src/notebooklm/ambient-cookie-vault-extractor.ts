/**
 * @file ambient-cookie-vault-extractor.ts
 * Zero-Click Ambient Browser Cookie Vault Extractor for Google NotebookLM.
 * Extracts session tokens from daily Chromium profile stores (Chrome, Edge, Brave) via SQLite & DPAPI.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as child_process from 'node:child_process';
import { SessionCredentialsManager } from './session-credentials-manager.js';
import { AmbientFirefoxVaultExtractor, type FirefoxProfile } from './ambient-firefox-vault-extractor.js';

export { type FirefoxProfile };

export interface BrowserVaultProfile {
  browserName: string;
  profileName: string;
  localStatePath: string;
  cookiesDbPath: string;
}

export interface VaultExtractionResult {
  success: boolean;
  cookies?: string;
  browser?: string;
  profilePath?: string;
  error?: string;
}

export interface VaultExtractorOptions {
  customProfiles?: BrowserVaultProfile[];
  customFirefoxProfiles?: FirefoxProfile[];
  dpapiRunner?: (base64Cipher: string) => Buffer | null;
  dbOpener?: (path: string) => Array<{ name: string; encrypted_value: Buffer }>;
  firefoxDbOpener?: (path: string) => Array<{ host: string; name: string; value: string }>;
}

export class AmbientCookieVaultExtractor {
  public static resolveCandidateProfiles(localAppData = process.env.LOCALAPPDATA || ''): BrowserVaultProfile[] {
    const candidates: BrowserVaultProfile[] = [];
    if (!localAppData) return candidates;

    const browserDefs = [
      { name: 'chrome', subDir: path.join('Google', 'Chrome', 'User Data') },
      { name: 'edge', subDir: path.join('Microsoft', 'Edge', 'User Data') },
      { name: 'brave', subDir: path.join('BraveSoftware', 'Brave-Browser', 'User Data') }
    ];

    for (const b of browserDefs) {
      const userDataDir = path.join(localAppData, b.subDir);
      const localStatePath = path.join(userDataDir, 'Local State');
      if (!fs.existsSync(localStatePath)) continue;

      const profileDirs = ['Default', 'Profile 1', 'Profile 2'];
      for (const p of profileDirs) {
        const netDb = path.join(userDataDir, p, 'Network', 'Cookies');
        const legacyDb = path.join(userDataDir, p, 'Cookies');
        const dbPath = fs.existsSync(netDb) ? netDb : fs.existsSync(legacyDb) ? legacyDb : null;
        if (dbPath) {
          candidates.push({ browserName: b.name, profileName: p, localStatePath, cookiesDbPath: dbPath });
        }
      }
    }
    return candidates;
  }

  public static resolveFirefoxProfiles(appData = process.env.APPDATA || ''): FirefoxProfile[] {
    return AmbientFirefoxVaultExtractor.resolveFirefoxProfiles(appData);
  }

  public static readFirefoxCookiesFromDb(
    cookiesDbPath: string,
    dbOpener?: (path: string) => Array<{ host: string; name: string; value: string }>
  ): string | null {
    return AmbientFirefoxVaultExtractor.readFirefoxCookiesFromDb(cookiesDbPath, dbOpener);
  }

  public static unprotectMasterKey(
    localStatePath: string,
    dpapiRunner?: (base64Cipher: string) => Buffer | null
  ): Buffer | null {
    try {
      if (!fs.existsSync(localStatePath)) return null;
      const json = JSON.parse(fs.readFileSync(localStatePath, 'utf8')) as Record<string, unknown>;
      const osCrypt = json.os_crypt as Record<string, unknown> | undefined;
      const encKeyB64 = typeof osCrypt?.encrypted_key === 'string' ? osCrypt.encrypted_key : null;
      if (!encKeyB64) return null;

      const encKey = Buffer.from(encKeyB64, 'base64');
      if (encKey.length < 5 || encKey.subarray(0, 5).toString('ascii') !== 'DPAPI') return null;

      const cipher = encKey.subarray(5);
      if (dpapiRunner) return dpapiRunner(cipher.toString('base64'));

      return AmbientCookieVaultExtractor.executeWindowsDpapi(cipher.toString('base64'));
    } catch {
      return null;
    }
  }

  private static executeWindowsDpapi(cipherB64: string): Buffer | null {
    if (process.platform !== 'win32') return null;
    try {
      const psCmd = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${cipherB64}'), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))`;
      const res = child_process.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
        encoding: 'utf8',
        timeout: 4000
      });
      if (!res.stdout || res.status !== 0) return null;
      const raw = res.stdout.trim();
      return raw.length > 0 ? Buffer.from(raw, 'base64') : null;
    } catch {
      return null;
    }
  }

  public static decryptCookieValue(encryptedValue: Buffer, masterKey: Buffer): string | null {
    try {
      if (encryptedValue.length < 31) return null;
      const prefix = encryptedValue.subarray(0, 3).toString('ascii');
      if (prefix !== 'v10' && prefix !== 'v11') return null;

      const iv = encryptedValue.subarray(3, 15);
      const ciphertext = encryptedValue.subarray(15, encryptedValue.length - 16);
      const tag = encryptedValue.subarray(encryptedValue.length - 16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  public static readGoogleCookiesFromDb(
    cookiesDbPath: string,
    masterKey: Buffer,
    dbOpener?: (path: string) => Array<{ name: string; encrypted_value: Buffer }>
  ): string | null {
    const tempDbPath = path.join(os.tmpdir(), `aegis-cookie-vault-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    try {
      fs.copyFileSync(cookiesDbPath, tempDbPath);
      const rows = dbOpener ? dbOpener(tempDbPath) : AmbientCookieVaultExtractor.querySqliteDatabase(tempDbPath);
      if (!rows || rows.length === 0) return null;

      const cookiePairs: string[] = [];
      for (const row of rows) {
        const val = AmbientCookieVaultExtractor.decryptCookieValue(row.encrypted_value, masterKey);
        if (val) cookiePairs.push(`${row.name}=${val}`);
      }

      const merged = cookiePairs.join('; ');
      const valRes = SessionCredentialsManager.validateCookieString(merged);
      return valRes.valid ? merged : null;
    } catch {
      return null;
    } finally {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    }
  }

  private static querySqliteDatabase(dbPath: string): Array<{ name: string; encrypted_value: Buffer }> {
    try {
      // Dynamic import to support node:sqlite cleanly with zero TS build issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqlite = require('node:sqlite') as {
        DatabaseSync: new (p: string, opts?: { readOnly?: boolean }) => {
          prepare: (q: string) => { all: () => Array<Record<string, unknown>> };
          close: () => void;
        };
      };
      const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        const stmt = db.prepare("SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%google.com%'");
        const rows = stmt.all();
        return rows
          .filter(r => typeof r.name === 'string' && Buffer.isBuffer(r.encrypted_value))
          .map(r => ({ name: r.name as string, encrypted_value: r.encrypted_value as Buffer }));
      } finally {
        db.close();
      }
    } catch {
      return [];
    }
  }

  public static extractFromAllVaults(options: VaultExtractorOptions = {}): VaultExtractionResult {
    const ffProfiles = options.customFirefoxProfiles !== undefined
      ? options.customFirefoxProfiles
      : (options.customProfiles ? [] : AmbientCookieVaultExtractor.resolveFirefoxProfiles());
    for (const ff of ffProfiles) {
      const cookies = AmbientCookieVaultExtractor.readFirefoxCookiesFromDb(ff.cookiesDbPath, options.firefoxDbOpener);
      if (cookies) {
        return { success: true, cookies, browser: 'firefox', profilePath: ff.cookiesDbPath };
      }
    }

    const profiles = options.customProfiles || AmbientCookieVaultExtractor.resolveCandidateProfiles();
    if (profiles.length === 0) {
      return { success: false, error: 'No Chromium browser profile vaults found on host.' };
    }

    for (const p of profiles) {
      const key = AmbientCookieVaultExtractor.unprotectMasterKey(p.localStatePath, options.dpapiRunner);
      if (!key) continue;

      const cookies = AmbientCookieVaultExtractor.readGoogleCookiesFromDb(p.cookiesDbPath, key, options.dbOpener);
      if (cookies) {
        return {
          success: true,
          cookies,
          browser: p.browserName,
          profilePath: p.cookiesDbPath
        };
      }
    }

    return { success: false, error: 'No active Google session cookies found in browser vaults.' };
  }
}
