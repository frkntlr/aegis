/**
 * @file spec-quality.ts
 * Specification: Deterministic Demir Kafes & Multi-Tier Quality Gates.
 * Covers: RFC-005, RFC-009, RFC-011, RFC-012, RFC-024, RFC-032.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_QUALITY_PAGE: WikiSuitePage = {
  slug: 'Spec-Quality-and-Iron-Cage',
  title: 'Mimari Spesifikasyon: Deterministik Demir Kafes & Çoklu Kalite Kapıları',
  threeBullets: [
    'Anayasal Demir Kafes: Maks 300 satır/dosya, maks 40 satır/fonksiyon, maks 10 karmaşıklık ve cerrahi diff.',
    'Fast-Stat Cache Radarı (RFC-032), %70 Mutasyon Test Kapısı, Değişmez Kâhin ve Kanıt Tabanlı Triyaj.',
    'Kapsanan Kararlar: RFC-005, RFC-009, RFC-011, RFC-012, RFC-024, RFC-032.'
  ],
  content: [
    '## 🛡️ Mimari Spesifikasyon: Deterministik Demir Kafes & Kalite Kapıları',
    '',
    'Aegis, LLM tabanlı yazılım üretiminde kontrolsüz kod şişmesi (bloat), sahte test geçişleri ve regresyonları önlemek için deterministik ve anayasal kalite kalkanları uygular. Bu spesifikasyon; RFC-005, RFC-009, RFC-011, RFC-012, RFC-024 ve RFC-032 kararlarının sentezidir.',
    '',
    '```mermaid',
    'flowchart TD',
    '  CODE["Ajan Tarafından Üretilen Kod / Diff"] --> STAT["1. Fast-Stat Cache Radarı (<10ms)"]',
    '  STAT --> CAGE["2. Demir Kafes Kuralları (300/40/10)"]',
    '  CAGE --> ORACLE["3. Değişmez Kâhin (Test Tahrif Engeli)"]',
    '  ORACLE --> MUT["4. %70 Mutasyon Test Kapısı (aegis mutate)"]',
    '  MUT --> MM["5. Multimodal Kapı: Demir Kafes + Playtest"]',
    '  MM --> PASS["✅ Onaylandı & Merge Pipeline"]',
    '```',
    '',
    '---',
    '',
    '### 1. Deterministik Demir Kafes Anayasası (RFC-012)',
    'Tüm kaynak kodlar Git hooklarında (`pre-commit`, `pre-push`) ve CLI denetiminde (`aegis cage:check`) 4 temel kurala göre denetlenir:',
    '1. **Azami 300 Satır / Dosya:** Dosya büyüdüğünde modüler alt parçalara ayrılmalıdır.',
    '2. **Azami 40 Satır / Fonksiyon:** Uzayan fonksiyonlar cerrahi yardımcı parçalara bölünmelidir.',
    '3. **Azami 10 Karmaşıklık (Cyclomatic Complexity):** Aşırı iç içe dallanmalar reddedilir.',
    '4. **Cerrahi Birleşik Farklar (Surgical Diffs):** Tam dosya yeniden yazımı (full rewrite) yasaktır; sadece cerrahi unified diff kabul edilir.',
    '',
    '---',
    '',
    '### 2. Fast-Stat Cache Radarı (RFC-032) & Kanıt Tabanlı Triyaj (RFC-024)',
    '- **Fast-Stat Cache Radarı:** Değişmeyen dosyaları diskten okumak yerine mtime hash önbelleğiyle 10ms altında doğrular; 400+ dosyalık monorepolarda bile 0ms gecikmeyle sonuçlanır.',
    '- **Kanıt Tabanlı Bug Triyajı (`aegis triage`):** Sıfır yanlış alarm prensibiyle çalışır; somut motor çıktısı veya yığın izi kanıtı olmayan varsayımsal hata raporlarını eler.',
    '',
    '---',
    '',
    '### 3. %70 Mutasyon Test Kapısı & Değişmez Kâhin (RFC-009, RFC-005)',
    '- **Mutasyon Test Kapısı (`aegis mutate <file>`):** Kod mantığındaki operatörleri mutasyona uğratarak test paketinin mutantların **en az %70\'ini yakalayıp öldürmesini** zorunlu kılar.',
    '- **Değişmez Kâhin (`ImmutableOracle`):** Ajanların test assertion\'larını gevşetmesini veya sahte geçiş (`assert.ok(true)`) eklemesini statik analizle tespit eder ve engeller.',
    '- **RTK (Response Token Killer) Sıkıştırıcı (`aegis rtk:compress`):** Terminal ve test loglarındaki gereksiz satırları temizleyerek %90 prompt token tasarrufu sağlar.',
    '',
    '---',
    '',
    '### 💻 Kalite Kapıları Komut ve MCP Referansı',
    '| Komut / MCP Aracı | Görev |',
    '|---|---|',
    '| `aegis cage:check [dir]` (`cage_check`) | Kaynak kodları Demir Kafes (300/40) kurallarına göre denetler. |',
    '| `aegis verify:task [file]` | Multimodal kalite kapısını (Demir Kafes + Playtest) çalıştırır. |',
    '| `aegis mutate <file>` | %70 Mutasyon Test Kapısını çalıştırır. |',
    '| `aegis triage [dir]` (`triage`) | Kanıt tabanlı sıfır sahte alarmlı hata triyajı yapar. |',
    '| `aegis rtk:compress` (`rtk_compress`) | Terminal/test loglarını %90 sıkıştırır. |',
    '| `aegis budget:inspect <file>` (`budget_inspect`) | Dosya ve fonksiyon satır bütçesi kota durumunu inceler. |'
  ].join('\n')
};
