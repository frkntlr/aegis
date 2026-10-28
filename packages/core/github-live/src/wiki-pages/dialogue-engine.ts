/**
 * @file dialogue-engine.ts
 * Consolidation notice for Dialogue & Diagnostic Engine.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const DIALOGUE_ENGINE_PAGE: WikiSuitePage = {
  slug: 'Dialogue-Engine',
  title: 'Semptom Sınıflandırıcı & Sokratik Etkileşimli Teşhis Motoru',
  threeBullets: [
    'Deterministik 3 Fazlı Durum Makinesi: Semptom -> Netleştirme (Clarification) -> Reçete (Prescription).',
    'Sokratik Kanıt Tabanlı Hata Ayıklama (aegis debug) & Çok Dilli Yığın İzi Ayrıştırıcı.',
    'Geliştirici veya Ajan Tıkanıklıklarını Sınıflandırıp Otomatik Demir Kafes Görev Reçetesi Oluşturma.'
  ],
  content: [
    '## 💬 Etkileşimli Diyalog ve Teşhis Motoru (`@aegis/dialogue-engine`)',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 7)]]** altında birleştirilmiştir.',
    '',
    'Aegis, karmaşık hata teşhislerinde ve belirsiz geliştirici taleplerinde bağlam kaymasını (context drift) engellemek için deterministik 3-fazlı klinik diyalog ve hata ayıklama motoru içerir:',
    '',
    '- **Turn 1 - Semptom Girişi:** Gelen hata çıktısı (`SymptomClassifier`) ile ayrıştırılır (RUNTIME_CRASH, PERFORMANCE_REGRESSION, UI_ALIGNMENT_ISSUE vb.).',
    '- **Turn 2 - Netleştirme & Hipotez:** Sokratik kanıt tabanlı hipotezler üretilir; kök neden adayı triangüle edilir (`aegis debug`).',
    '- **Turn 3 - Klinik Reçete:** Sadece doğrulanmış hipotez için cerrahi diff ve Demir Kafes limitleri belirlenir (`PrescriptionBuilder`).',
    '- **Döngü Devre Kesici (Circuit Breaker):** Bir ajan ardışık 3 kez başarısız olursa görev `blocked` yapılır ve kilitler çözülür (`aegis loop:status`).',
    '',
    'Detaylı şemalar ve durum makinesi tasarımı için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis debug [error]`: Sokratik kanıt tabanlı hata ayıklama oturumu başlatır.',
    '- `aegis loop:status`: Devre kesici sayaçlarını ve bloke görevleri inceler.',
    '- `aegis loop:reset [id]`: Sayaçları sıfırlar ve görevi unblock eder.'
  ].join('\n')
};
