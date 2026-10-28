/**
 * @file notebooklm.ts
 * Consolidation notice for Google NotebookLM Integration.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const NOTEBOOKLM_PAGE: WikiSuitePage = {
  slug: 'NotebookLM-Integration',
  title: 'Google NotebookLM Derin Araştırma & Yaşayan Zemin Gerçeği',
  threeBullets: [
    'Doğrulanmış zemin kaynakları ([cite: x, y]) ile halüsinasyonsuz mimari sentez ve 3 katmanlı zemin bilgisi.',
    'Otonom Bilgi Yönetimi (AKG): 50-kaynak Quota Sentinel, MFCS budama ve Mezar Taşı Mahzeni (nlm:prune, nlm:restore).',
    'Sıfır-Tıklama Ortam Hasatçısı (CDP portları, DPAPI kasaları), Hesap Değiştirme (nlm:switch) ve Tri-State Protokolü.'
  ],
  content: [
    '## 🔬 Google NotebookLM Entegrasyonu & Zemin Gerçeği',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 8)]]** altında birleştirilmiştir.',
    '',
    'Aegis, mimari kararlar ve kütüphane seçimlerinde LLM\'lerin ezbere tahmin üretmesini engellemek için **Google NotebookLM**\'i birincil zemin gerçeği araştırma motoru olarak kullanır:',
    '',
    '- **Zemin Gerçeği & Kaynak Alıntıları (`[cite: x, y]`):** Mimari kararları doğrulanabilir teknik kararlara (ADR) dönüştürür.',
    '- **Otonom Bilgi Yönetimi (AKG) & Mezar Taşı Mahzeni:** 50 kaynak sınırını MFCS puanlamasıyla otonom yönetir; silinen kaynaklar `.aegis/tombstones/` altında saklanır (`aegis nlm:prune`, `aegis nlm:restore`).',
    '- **Sıfır-Tıklama Ortam Keşfi:** CDP portları ve tarayıcı çerez kasalarından oturum tokenlarını hasat eder.',
    '- **Tri-State Yetkilendirme Protokolü:** Oturum süresi dolduğunda Antigravity modalı ile şeffaf yönlendirme yapar.',
    '- **Otonom Araştırma Motoru (`aegis nlm:research`):** Araştırma notlarını derleyip yaşayan Wiki\'ye otomatik yazar.',
    '',
    'Detaylı şemalar ve yaşam döngüsü için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis nlm:query "<soru>"`: Doğrulanmış zemin alıntılarıyla soru sorar.',
    '- `aegis nlm:research "<konu>"`: Otonom araştırma başlatır ve Wiki\'ye aktarır.',
    '- `aegis nlm:prune [--dry-run]`: Bayat kaynakları budar ve mahzene arşivler.',
    '- `aegis nlm:switch [tarayıcı]`: Sıfır tıklamayla hesap değiştirir.'
  ].join('\n')
};
