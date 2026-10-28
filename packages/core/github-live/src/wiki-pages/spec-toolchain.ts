/**
 * @file spec-toolchain.ts
 * Specification: Toolchain, Monorepo Performance & Process Watchdog.
 * Covers: RFC-025, RFC-027, RFC-028, RFC-029, RFC-030, RFC-033.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_TOOLCHAIN_PAGE: WikiSuitePage = {
  slug: 'Spec-Toolchain-and-Performance',
  title: 'Mimari Spesifikasyon: Araç Zinciri, Monorepo Hızlandırma & Watchdog',
  threeBullets: [
    'Turborepo İçerik Adresli Önbellek ve TypeScript Project References (RFC-033) ile %80 daha hızlı derleme.',
    'Çapraz Platform Süreç Ağacı Watchdog (RFC-028) ve Sıfır Gecikmeli Çevrimdışı Git Substrate (RFC-029/030).',
    'Kapsanan Kararlar: RFC-025, RFC-027, RFC-028, RFC-029, RFC-030, RFC-033.'
  ],
  content: [
    '## ⚡ Mimari Spesifikasyon: Araç Zinciri & Monorepo Performansı',
    '',
    'Aegis, geliştirici ve ajan üretkenliğini en üst düzeye çıkarmak için sıfır gecikmeli monorepo derlemesi, süreç ağacı sonlandırma ve offline-resilient Git altyapısı sunar. Bu spesifikasyon; RFC-025, RFC-027, RFC-028, RFC-029, RFC-030 ve RFC-033 kararlarının sentezidir.',
    '',
    '```mermaid',
    'flowchart LR',
    '  DEV["Ajan / Geliştirici Aksiyonu"] --> TURBO["Turborepo Hızlandırma (RFC-025)"]',
    '  TURBO --> COMP["TS Project References (composite: true) (RFC-033)"]',
    '  COMP --> WATCHDOG["İşlem Ağacı Watchdog (Tree-Kill SIGKILL) (RFC-028)"]',
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
    '### 💻 Araç Zinciri Komut Referansı',
    '| Komut | Görev |',
    '|---|---|',
    '| `npm run build` | Turborepo ve TS Project References ile artımlı monorepo derlemesi yapar. |',
    '| `npm test` | İçerik adresli önbellek ile birim testleri anında koşturur. |',
    '| `aegis wiki:sync [--force]` | Canlı GitHub Wiki ile yerel yaşayan belleği çift yönlü eşitler. |',
    '| `aegis ide:sync` | MCP sunucularını ve becerileri tüm desteklenen editörlere dağıtır. |'
  ].join('\n')
};
