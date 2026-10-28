/**
 * @file plugins.ts
 * Consolidation notice for Plugin & Extensibility Architecture.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const PLUGINS_PAGE: WikiSuitePage = {
  slug: 'Plugin-and-Extensibility',
  title: 'Aegis Eklenti Mimarisi & Topluluk Genişletilebilirliği',
  threeBullets: [
    'Modüler LanguageExtractor arayüzü ile TypeScript, Python, GDScript, Rust, Go ve C# desteği.',
    'Genişletilebilir IdeAdapter arayüzü ile yeni editörlerin sisteme sıfır kod değişikliğiyle eklenmesi.',
    'Sıfır-token Topluluk RFC Boru Hattı (aegis rfc:triage) ile tartışmalardan otonom görev türetme.'
  ],
  content: [
    '## 🧩 Eklenti Mimarisi & Genişletilebilirlik',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** altında birleştirilmiştir.',
    '',
    'Aegis, geliştiricilerin ve açık kaynak topluluğunun yeni programlama dilleri, editörler ve iş akışları ekleyebileceği modüler bir eklenti yapısına sahiptir:',
    '',
    '- **Dil Çıkarıcı Eklentileri (`LanguageExtractor`):** Çekirdek koda dokunmadan yeni diller için AST iskelet desteği sağlar (TS/JS, Python, GDScript, Rust, Go, C#).',
    '- **Özel IDE Adaptörleri (`IdeAdapter`):** Farklı kod editörlerini Aegis orkestrasyonuna bağlar.',
    '- **Sıfır-Token Topluluk RFC Boru Hattı (`aegis rfc:triage`):** GitHub Discussions üzerinden gelen topluluk RFC\'lerini otonom olarak ayrıştırıp kabul kriterlerine dönüştürür.',
    '',
    'Detaylı sistem tasarımı ve arayüz sözleşmeleri için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.'
  ].join('\n')
};
