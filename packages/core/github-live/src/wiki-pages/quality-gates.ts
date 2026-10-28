/**
 * @file quality-gates.ts
 * Consolidation notice for Quality Shields & Iron Cage.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const QUALITY_GATES_PAGE: WikiSuitePage = {
  slug: 'Quality-Shields-and-Gates',
  title: 'Deterministik Demir Kafes & Kalite Kalkanları Protokolü',
  threeBullets: [
    'Demir Kafes: Maks 40 satır/fonksiyon, maks 300 satır/dosya, maks 10 karmaşıklık ve Fast-Stat Cache Radarı.',
    'Multimodal Kalite Kapısı (aegis verify:task): Demir Kafes AST denetimi ve Headless Playtest-Before-PR zorunluluğu.',
    'Mutasyon Test Kapısı (%70), Sokratik Teşhis Kapısı (aegis debug), Değişmez Kâhin ve Anti-Hang Koruması.'
  ],
  content: [
    '## 🛡️ Deterministik Demir Kafes & Kalite Kapıları',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 6)]]** altında birleştirilmiştir.',
    '',
    'Aegis, LLM tabanlı geliştirmede kontrolsüz büyüme ve sahte test başarılarını önlemek için pazarlıksız anayasal kalite kapıları uygular:',
    '',
    '- **Demir Kafes Kuralları:** Maks 300 satır/dosya, maks 40 satır/fonksiyon, maks 10 karmaşıklık, sadece cerrahi diff kabulü.',
    '- **Fast-Stat Cache Radarı:** Değişmeyen dosyaları disk okuması yerine mtime hash önbelleğiyle 10ms altında denetler (`aegis cage:check`).',
    '- **Multimodal Kalite Kapısı (`aegis verify:task`):** Hem Demir Kafes AST sınırlarını hem de canlı motor playtestini tek komutta doğrular.',
    '- **%70 Mutasyon Test Kapısı (`aegis mutate`):** Test paketinin mantık mutantlarının en az %70\'ini öldürmesini şart koşar.',
    '- **Değişmez Kâhin (`ImmutableOracle`):** Test tahrifatını ve sahte `assert true` eklemelerini engeller.',
    '- **Kanıt Tabanlı Hata Triyajı (`aegis triage`):** Sıfır yanlış alarm prensibiyle varsayımsal bug\'ları eler.',
    '',
    'Detaylı şemalar ve kalite mimarisi için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis cage:check`: Demir Kafes standartlarına göre kaynak kodları denetler.',
    '- `aegis verify:task [dosya]`: Multimodal kalite kapısını çalıştırır.',
    '- `aegis mutate <dosya>`: %70 mutasyon test kapısını koşturur.',
    '- `aegis triage`: Kanıt tabanlı bug triyajını çalıştırır.'
  ].join('\n')
};
