/**
 * @file ambient-firefox-vault-extractor.ts
 * Firefox Profile Discovery & Cookie Extraction for Google NotebookLM.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionCredentialsManager } from './session-credentials-manager.js';

export interface FirefoxProfile {
  profileName: string;
  cookiesDbPath: string;
}

export class AmbientFirefoxVaultExtractor {
  public static resolveFirefoxProfiles(appData = process.env.APPDATA || ''): FirefoxProfile[] {
    const profiles: FirefoxProfile[] = [];
    if (!appData) return profiles;
    const baseDir = path.join(appData, 'Mozilla', 'Firefox', 'Profiles');
    if (!fs.existsSync(baseDir)) return profiles;

    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dbPath = path.join(baseDir, entry.name, 'cookies.sqlite');
        if (fs.existsSync(dbPath)) {
          profiles.push({ profileName: entry.name, cookiesDbPath: dbPath });
        }
      }
    } catch {
      // return empty on error
    }
    return profiles;
  }

  public static readFirefoxCookiesFromDb(
    cookiesDbPath: string,
    dbOpener?: (path: string) => Array<{ host: string; name: string; value: string }>
  ): string | null {
    const tempDir = path.join(os.tmpdir(), `aegis-ff-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      const tempDbPath = path.join(tempDir, 'cookies.sqlite');
      fs.copyFileSync(cookiesDbPath, tempDbPath);
      if (fs.existsSync(cookiesDbPath + '-wal')) fs.copyFileSync(cookiesDbPath + '-wal', tempDbPath + '-wal');

      const rows = dbOpener ? dbOpener(tempDbPath) : AmbientFirefoxVaultExtractor.queryFirefoxSqlite(tempDbPath);
      if (!rows || rows.length === 0) return null;

      const cookieMap = new Map<string, string>();
      for (const r of rows) {
        if (!cookieMap.has(r.name) || r.host.includes('notebook')) {
          cookieMap.set(r.name, r.value);
        }
      }

      const merged = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      const valRes = SessionCredentialsManager.validateCookieString(merged);
      return valRes.valid ? merged : null;
    } catch {
      return null;
    } finally {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private static queryFirefoxSqlite(dbPath: string): Array<{ host: string; name: string; value: string }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqlite = require('node:sqlite') as {
        DatabaseSync: new (p: string, opts?: { readOnly?: boolean }) => {
          prepare: (q: string) => { all: () => Array<Record<string, unknown>> };
          close: () => void;
        };
      };
      const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        const stmt = db.prepare("SELECT host, name, value FROM moz_cookies WHERE host LIKE '%google.com%'");
        const rows = stmt.all();
        return rows
          .filter(r => typeof r.host === 'string' && typeof r.name === 'string' && typeof r.value === 'string')
          .map(r => ({ host: r.host as string, name: r.name as string, value: r.value as string }));
      } finally {
        db.close();
      }
    } catch {
      return [];
    }
  }
}
