/**
 * @file toolchain.ts
 * Consolidation notice for Toolchain & IDE Matrix.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const TOOLCHAIN_PAGE: WikiSuitePage = {
  slug: 'Toolchain-and-IDEs',
  title: 'Çoklu-IDE & Araç Zinciri Uyumluluk Matrisi',
  threeBullets: [
    'Antigravity (MultiGravity), Cursor, Windsurf, Zed ve VS Code için evrensel çoklu-editör orkestrasyonu.',
    'Evrensel CLI (aegis), Monorepo TypeScript Project References (RFC-033) ve Turborepo Hızlandırma.',
    'Çapraz Platform Süreç Ağacı Sonlandırma (RFC-025/RFC-028) ve Otomatik Dizin İzolasyonu.'
  ],
  content: [
    '## 💻 Çoklu-IDE & Araç Zinciri Uyumluluk Matrisi',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 1 & 4)]]** altında birleştirilmiştir.',
    '',
    'Aegis, geliştiricileri ve otonom ajanları tek bir kod editörüne hapsetmez. Google Antigravity\'nin çoklu-oturum gücünden Cursor, Windsurf, Zed ve VS Code\'a kadar tüm modern geliştirme ortamlarını tek çatı altında toplar:',
    '',
    '- **Evrensel CLI (`aegis`):** Proje dizininden bağımsız evrensel ikili dosya olarak çalışır.',
    '- **TypeScript Project References & Turborepo:** 14 paketin `tsconfig.json` referansları ve içerik adresli önbelleği ile %80 daha hızlı derleme.',
    '- **Çapraz Platform Süreç Ağacı Watchdog:** Donan süreçler (Node/Godot) tüm alt dallarıyla birlikte (`taskkill /T /F` veya `process groups`) sonlandırılır.',
    '- **Otomatik Ayar İzolasyonu:** Editörlerin paralel worktree dizinlerini tarayarak işlemciyi kilitlemesi otomatik ayar enjeksiyonuyla engellenir.',
    '',
    'Detaylı şemalar ve IDE matrisi için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis ide:sync`: MCP sunucularını ve becerileri tüm desteklenen editörlere eşitler.',
    '- `aegis status`: Aktif worktree durumlarını ve kilitleri raporlar.'
  ].join('\n')
};
