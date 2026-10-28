/**
 * @file spec-diagnostic.ts
 * Specification: Socratic Interactive Diagnostic & Dialogue Engine.
 * Covers: RFC-014, RFC-015.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_DIAGNOSTIC_PAGE: WikiSuitePage = {
  slug: 'Spec-Diagnostic-and-Dialogue',
  title: 'Mimari Spesifikasyon: Sokratik Teşhis, Diyalog & Devre Kesici',
  threeBullets: [
    'Deterministik 3-Fazlı Durum Makinesi: Semptom Sınıflandırma -> Netleştirme/Hipotez -> Klinik Reçete.',
    'Sokratik Kanıt Tabanlı Hata Ayıklama (aegis debug), Yığın İzi Ayrıştırıcı ve Akıllı Devre Kesici.',
    'Kapsanan Kararlar: RFC-014 (Socratic Dialogue Engine) ve RFC-015 (Interactive Debugging & Antigravity).'
  ],
  content: [
    '## 💬 Mimari Spesifikasyon: Sokratik Teşhis, Diyalog & Devre Kesici',
    '',
    'Aegis, karmaşık hata teşhislerinde ve belirsiz geliştirici taleplerinde ajanların rastgele kararlar alıp bağlam kayması (context drift) yaşamasını engellemek için klinik bir teşhis ve durum makinesi motoru uygular. Bu spesifikasyon; RFC-014 ve RFC-015 kararlarının sentezidir.',
    '',
    '```mermaid',
    'stateDiagram-v2',
    '  [*] --> Semptom: Turn 1 (Hata / Log Girişi)',
    '  Semptom --> Netlestirme: SymptomClassifier & Triangulator',
    '  Netlestirme --> Hipotez: DynamicHypothesisGenerator',
    '  Hipotez --> Recete: Doğrulanmış Hipotez Seçimi',
    '  Recete --> [*]: Demir Kafes Görev Enjeksiyonu (TIP)',
    '  Hipotez --> CircuitBreaker: 3 Kez Ardışık Başarısızlık',
    '  CircuitBreaker --> [*]: Görev Bloke & Kilitler Çözüldü',
    '```',
    '',
    '---',
    '',
    '### 1. Deterministik 3-Fazlı Durum Makinesi (RFC-014)',
    '- **Turn 1 - Semptom Girişi:** Hata yığın izi (`PolyglotStackTraceParser`) ve konsol çıktıları satır satır ayrıştırılır; hata tipi (RUNTIME_CRASH, PERFORMANCE_REGRESSION, UI_ALIGNMENT_ISSUE, ARCHITECTURE_VIOLATION vb.) sınıflandırılır.',
    '- **Turn 2 - Netleştirme & Hipotez:** Kod tabanı hafızasındaki AST iskeletini ve çağrı ilişkilerini tarayarak hatanın patlama yarıçapını ve kök neden adaylarını triangüle eder (`SymbioticDiagnosticTriangulator`).',
    '- **Turn 3 - Klinik Reçete:** Sadece doğrulanmış hipotez için cerrahi diff, kabul kriterleri ve Demir Kafes satır bütçesi üretilir (`PrescriptionBuilder`).',
    '',
    '---',
    '',
    '### 2. Akıllı Devre Kesici (Circuit Breaker)',
    '- Bir ajan aynı hata üzerinde ardışık 3 kez başarısız olursa Circuit Breaker tetiklenir.',
    '- Görev derhal `blocked` durumuna çekilir, dosya kilitleri çözülür.',
    '- Ajan kısır döngüde token ve CPU tüketmekten alıkonur; sorun insan geliştiriciye şeffaf olarak iletilir.',
    '',
    '---',
    '',
    '### 3. Google Antigravity & Etkileşimli Teşhis Uyumu (RFC-015)',
    '- Google Antigravity içindeki `ask_question` aracı ile ajan, belirsizlikleri kullanıcıya çoktan seçmeli olarak sorar.',
    '- Hata teşhisi "kör tahmin" yerine doğrudan kanıta dayalı etkileşimli bir seansa dönüşür.',
    '',
    '---',
    '',
    '### 💻 Teşhis ve Diyalog Komut Referansı',
    '| Komut / MCP Aracı | Görev |',
    '|---|---|',
    '| `aegis debug [error]` (`socratic_diagnose`) | Sokratik kanıt tabanlı etkileşimli hata ayıklama oturumu başlatır. |',
    '| `aegis loop:status` | Devre kesici sayaçlarını ve bloke görevleri denetler. |',
    '| `aegis loop:reset [id]` | Sayaçları sıfırlar ve bloke görevi yeniden `ready` yapar. |'
  ].join('\n')
};
