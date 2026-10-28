/**
 * @file spec-memory.ts
 * Specification: 5-Layer Codebase Memory & AST Intelligence.
 * Covers: RFC-003, RFC-004, RFC-006, RFC-007, RFC-008, RFC-010, RFC-016, RFC-031.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_MEMORY_PAGE: WikiSuitePage = {
  slug: 'Spec-Memory-and-AST',
  title: 'Mimari Spesifikasyon: 5-Katmanlı Kod Tabanı Hafızası & AST Zekâsı',
  threeBullets: [
    '5 Katmanlı Cerrahi Hafıza: AST İskeletleme, Symbiotic Substrate 2.0, İlişkisel Graf, Context7 ve LRU Watcher.',
    'Proaktif Sözleşme Kayması Radarı (aegis deps:drift): O(1) streaming CRLF-invariant lockfile hashi.',
    'Kapsanan Kararlar: RFC-003, RFC-004, RFC-006, RFC-007, RFC-008, RFC-010, RFC-016, RFC-031.'
  ],
  content: [
    '## 🧠 Mimari Spesifikasyon: 5-Katmanlı Kod Tabanı Hafızası & AST Zekâsı',
    '',
    'Aegis, LLM modellerinin büyük kod depolarında yaşadığı **context bloat** (bağlam şişmesi) ve **context drop** (bağlam unutma) sorununu ortadan kaldırmak için deterministik ve çok katmanlı bir hafıza mimarisi uygular. Bu spesifikasyon; RFC-003, RFC-004, RFC-006, RFC-007, RFC-008, RFC-010, RFC-016 ve RFC-031 kararlarının sentezidir.',
    '',
    '```mermaid',
    'flowchart TD',
    '  L5["Katman 5: Bellek İçi LRU & Canlı Artımlı Watcher Daemon"]',
    '  L4["Katman 4: Deterministik Demir Kafes Kotaları & Cerrahi Diff Bütçesi"]',
    '  L3["Katman 3: Context7 Canlı Zemin Belgeleri & Sözleşme Kayması Radarı"]',
    '  L2["Katman 2: İlişkisel Çağrı Çizgesi, Sinyaller & Sahne Topolojisi"]',
    '  L1["Katman 1: Çok Dilli AST İskeletleme & Symbiotic Substrate 2.0"]',
    '  L5 --> L4 --> L3 --> L2 --> L1',
    '```',
    '',
    '---',
    '',
    '### 1. Katman 1: Çok Dilli AST İskeletleme & Symbiotic Substrate 2.0',
    'Ham dosyalardaki fonksiyon gövdelerini atar; yalnızca tip, arayüz, sınıf ve metot imzalarını korur:',
    '- **Desteklenen Diller:** TypeScript, JavaScript, GDScript, Python, Rust, C#, Go ve Godot `.tscn` sahneleri.',
    '- **Symbiotic Substrate 2.0 (RFC-016):** 1. derece somut imzalar korunurken 2.+ derece geçişli tipler tek satırlık nominal stübler (`__opaque`) olarak katlanır.',
    '- **Token Verimi:** %67 - %95 oranında token tasarrufu sağlar; prompt cache dostudur.',
    '',
    '---',
    '',
    '### 2. Katman 2: İlişkisel Çağrı Çizgesi & Çapraz Referans Haritası (RFC-004)',
    '- **Çağrı Yönü Analizi:** `aegis trace <hedef>` ile çağıranlar (callers) ve çağrılanlar (callees) haritalandırılır.',
    '- **Patlama Yarıçapı (Blast Radius):** Yapılan bir değişikliğin depodaki hangi dosyaları etkileyeceği anlık hesaplanır.',
    '- **Godot Sinyal ve Sahne Haritalama:** GDScript sinyalleri ile `.tscn` düğümleri arasındaki ilişkiler taranır.',
    '',
    '---',
    '',
    '### 3. Katman 3: Context7 & Sözleşme Kayması Radarı (RFC-006, RFC-016)',
    '- **Resmi Zemin Belgeleri:** Godot 4, TypeScript, Fastify vb. kütüphanelerin doğrulanmış dokümanları hafızaya enjekte edilir (`context7_query`).',
    '- **Contract Drift Radar (`aegis deps:drift`):** `package-lock.json`, `pnpm-lock.yaml`, `project.godot` dosyalarını $O(1)$ streaming CRLF-invariant SHA-256 ile tarar; sözleşme kaymalarını anında yakalar.',
    '',
    '---',
    '',
    '### 4. Katman 4 & 5: Cerrahi Bütçeleme, LRU Önbellek & Canlı İzleyici (RFC-010, RFC-031)',
    '- **Demir Kafes Bütçelemesi:** Ajan dosyaya dokunmadan önce kalan satır ve fonksiyon bütçesi hesaplanır.',
    '- **Artımlı İzleyici (`aegis memory:watch`):** Yalnızca değişen dosyaları yeniden ayrıştırarak LRU önbelleğini 1-5 milisaniyede günceller.',
    '- **Soğuk Başlangıç Hızlandırması (`aegis memory:cold-start`):** Depo ilk açıldığında paralel iş parçacıklarıyla hafızayı sıfır gecikmeyle hazırlar.',
    '',
    '---',
    '',
    '### 💻 Hafıza & AST Komut ve MCP Referansı',
    '| Komut / MCP Aracı | Görev |',
    '|---|---|',
    '| `aegis memory:query <sym>` (`memory_query`) | Sembolün AST dilimini, çağıranlarını ve etki alanını sorgular. |',
    '| `aegis memory:stats` (`memory_stats`) | İndekslenen sembol sayılarını ve token tasarrufunu raporlar. |',
    '| `aegis find <sym>` (`find_symbol`) | Sembolün dosya yolu ve cerrahi kod dilimini döndürür. |',
    '| `aegis trace <hedef>` (`trace_relational`) | İlişkisel çağrıcı ve sinyal izini haritalandırır. |',
    '| `aegis deps:drift` | Symbiotic Substrate 2.0 sözleşme kayması radarını çalıştırır. |',
    '| `aegis ast:search <pat>` (`ast_search`) | `ast-grep` yapısal desen araması yapar. |',
    '| `aegis ast:replace <p> <r> <f>` (`ast_replace`) | Yapısal AST değiştirmesi uygular. |'
  ].join('\n')
};
