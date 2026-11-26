/**
 * @file spec-toolchain.ts
 * Specification: Toolchain, Monorepo Performance & Process Watchdog.
 * Covers: RFC-025, RFC-027, RFC-028, RFC-029, RFC-030, RFC-033, RFC-036.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_TOOLCHAIN_PAGE: WikiSuitePage = {
  slug: 'Spec-Toolchain-and-Performance',
  title: 'Mimari Spesifikasyon: Araç Zinciri, Monorepo Hızlandırma & Watchdog',
  threeBullets: [
    'Turborepo İçerik Adresli Önbellek ve TypeScript Project References (RFC-033) ile %80 daha hızlı derleme.',
    'Çapraz Platform Süreç Ağacı Watchdog (RFC-028) ve Sıfır Gecikmeli Çevrimdışı Git Substrate (RFC-029/030).',
    'Kapsanan Kararlar: RFC-025, RFC-027, RFC-028, RFC-029, RFC-030, RFC-033, RFC-036.'
  ],
  content: [
    '## ⚡ Mimari Spesifikasyon: Araç Zinciri & Monorepo Performansı',
    '',
    'Aegis, geliştirici ve ajan üretkenliğini en üst düzeye çıkarmak için sıfır gecikmeli monorepo derlemesi, süreç ağacı sonlandırma, topolojik bağımlılık bütünlüğü ve offline-resilient Git altyapısı sunar. Bu spesifikasyon; RFC-025, RFC-027, RFC-028, RFC-029, RFC-030, RFC-033 ve RFC-036 kararlarının sentezidir.',
    '',
    '```mermaid',
    'flowchart LR',
    '  DEV["Ajan / Geliştirici Aksiyonu"] --> TURBO["Turborepo Hızlandırma (RFC-025)"]',
    '  TURBO --> COMP["TS Project References (composite: true) (RFC-033)"]',
    '  COMP --> TOPO["Topolojik Bağımlılık Radarı (RFC-036)"]',
    '  TOPO --> WATCHDOG["İşlem Ağacı Watchdog (Tree-Kill SIGKILL) (RFC-028)"]',
    '  WATCHDOG --> WIKI["Sıfır Gecikmeli Wiki Sync Substrate (RFC-029/030)"]',
    '```',
    '',
    '---',
    '',
    '### 1. TypeScript Project References & Turborepo Hızlandırması (RFC-033, RFC-025)',
    '- **TypeScript Project References:** 14 paketin `tsconfig.json` yapılandırması `composite: true` ve referans bağlantıları ile donatılmıştır. Yalnızca değişen paketler derlenir; tam derleme süreleri %80 kısalır.',
    '- **Turborepo Önbelleği:** Git hook\'larında (`pre-commit`, `pre-push`) çalıştırılan test ve derleme adımları Turborepo içerik adresli önbelleği ile korunur; değişmeyen paketlerin testleri 0 milisaniyede tamamlanır (`FULL TURBO`).',
    '',
    '---',
    '',
    '### 2. Çapraz Platform Süreç Ağacı Watchdog (RFC-028)',
    '- Donan veya zaman aşımına uğrayan süreçler (Node/Godot), Windows üzerinde `taskkill /T /F`, Unix üzerinde süreç grupları (`process.kill(-pid)`) ile tüm alt dallarıyla birlikte temizlenir.',
    '- Arkada hayalet node veya godot süreçleri bırakılmaz; bellek sızıntıları ve port kilitlenmeleri fiziksel olarak engellenir.',
    '',
    '---',
    '',
    '### 3. Sıfır Gecikmeli Çevrimdışı Git & Wiki Senkronizasyonu (RFC-029, RFC-030)',
    '- **Ağ Zaman Aşımı Eliminasyonu:** Yerel Git radarı ile ağ gecikmesi olmadan yerel önbellek doğrulanır.',
    '- **Çevrimdışı Dayanıklılık:** İnternet bağlantısı kesildiğinde bile yaşayan hafıza yerel disk üzerinde kesintisiz çalışmaya devam eder.',
    '- **Otomatik Eşitleme (`aegis wiki:sync`):** Ağ erişimi sağlandığında yerel commitler uzaktaki GitHub Wiki deposuna atomik olarak aktarılır.',
    '',
    '---',
    '',
    '### 4. Topolojik Bağımlılık, Paketleme & Hermetiklik (RFC-036)',
    '- **Bağımsız `@aegis/cli` Paketleme & Docker Sandbox:** `packages/cli/scripts/bundle.mjs` hem `dist/bin/aegis.js` hem `dist/index.js` girişlerini tüm çalışma alanı paketlerini içine gömerek paketler (`@aegis/*` yalnızca `devDependencies`, `typescript` ise çalışma zamanı bağımlılığı olarak bildirilir); `docker/agent-runtime.Dockerfile` non-root `aegis-agent` altında izole çalışır.',
    '- **BOM-Güvenli JSON & Geçici Wiki Auth:** Tüm üretim JSON okumaları `@aegis/shared` `readJsonSafe` / `stripBom` üzerinden geçer; GitHub Wiki eşitlemesi `.git/config` içine düz metin token yazmak yerine `GIT_CONFIG_*` ortam değişkenleriyle geçici yetkilendirme kullanır.',
    '- **Topolojik Kod Radarı (`aegis deps:drift`) & Yerel CI (`aegis ci:audit`):** Tüm `14` paket `exports` bildirimine ve boş-test korumasına (`!f.length`) sahiptir; `aegis ci:audit` 10 GitHub Actions kapısını yerelde deterministik doğrular.',
    '',
    '---',
    '',
    '### 💻 Araç Zinciri Komut Referansı',
    '| Komut | Görev |',
    '|---|---|',
    '| `npm run build` | Turborepo, TS Project References ve CLI esbuild paketlemesini çalıştırır. |',
    '| `npm run lint` / `typecheck` | Biome (`0` hata/uyarı) ve `tsc --build` katı tip denetimini koşturur. |',
    '| `npm test` | İçerik adresli önbellek ve boş-paket korumasıyla tüm birim testlerini koşturur. |',
    '| `aegis ci:audit` | 10 GitHub Actions CI kapısını yerelde deterministik doğrular. |',
    '| `aegis deps:drift` | Ekosistem lockfile, TS Project References ve topolojik grafı denetler. |',
    '| `aegis wiki:sync [--force]` | Canlı GitHub Wiki ile yerel yaşayan belleği çift yönlü eşitler. |',
    '| `aegis ide:sync` | MCP sunucularını ve becerileri tüm desteklenen editörlere dağıtır. |'
  ].join('\n')
};
