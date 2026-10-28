/**
 * @file memory-engine.ts
 * Consolidation notice for Codebase Memory Engine.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const MEMORY_ENGINE_PAGE: WikiSuitePage = {
  slug: 'Codebase-Memory-Engine',
  title: '5-Katmanlı Kod Tabanı Hafıza Motoru (Codebase Memory Engine)',
  threeBullets: [
    '5 Katmanlı Cerrahi Hafıza: AST İskeleti, İlişkisel Çizge, Context7 Dokümantasyonu, Demir Kafes ve LRU Watcher.',
    'Symbiotic Substrate 2.0: Bounded Depth Transitive Type Closure, Nominal Opaque Stubbing ve %90-95 token tasarrufu.',
    'Proaktif Sözleşme Kayması Radarı (aegis deps:drift): O(1) streaming CRLF-invariant lockfile hashi ve ekosistem izolasyonu.'
  ],
  content: [
    '## 🧠 5-Katmanlı Kod Tabanı Hafıza Motoru',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 2)]]** altında birleştirilmiştir.',
    '',
    'Aegis, LLM modellerinin büyük kod depolarında yaşadığı **context bloat** ve bağlam unutma sorununu çözmek için `@aegis/ast-skeleton` çekirdeğinde 5 katmanlı cerrahi hafıza mimarisi uygular:',
    '',
    '1. **Katman 1 - Çok Dilli AST İskeletleme:** TS/JS, GDScript, Python, Rust, Go, C# dosyalarında gövdeleri atar, tip ve sözleşme imzalarını korur (%67-95 token tasarrufu).',
    '2. **Katman 2 - İlişkisel Graf Motoru:** Sembolün çağıranlarını, çağırdıklarını, sinyallerini ve sahnelerini haritalandırır (`find_symbol`, `trace_relational`).',
    '3. **Katman 3 - Context7 & Sözleşme Kayması Radarı:** Kütüphane API doğrulaması (`context7_query`) ve lockfile bütünlük kontrolü (`aegis deps:drift`).',
    '4. **Katman 4 - Deterministik Demir Kafes Kotaları:** Değişiklik öncesi dosya ve fonksiyon satır bütçesini hesaplar.',
    '5. **Katman 5 - Bellek İçi LRU & Canlı İzleyici:** `aegis memory:watch` ile 1-5 milisaniyede önbellek tazeleme.',
    '',
    'Detaylı şemalar, monorepo paket dağılımı ve mimari akış için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis memory:query <sembol>`: Sembolün AST dilimini ve etki alanını sorgular.',
    '- `aegis memory:watch`: Kod tabanı hafızasını canlı izleyen artımlı watcher başlatır.',
    '- `aegis deps:drift`: Sözleşme Kayması Radarı ile lockfile doğrular.'
  ].join('\n')
};
