/**
 * @file godot-bridge.ts
 * Consolidation notice for Godot Bridge Deep Integration.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const GODOT_BRIDGE_PAGE: WikiSuitePage = {
  slug: 'Godot-Bridge-Deep-Integration',
  title: 'Godot 4.x Oyun Motoru Köprüsü & Substrate 3.0',
  threeBullets: [
    'Godot Substrate 3.0: Çift yönlü WebSocket köprüsü, tek seferlik token el sıkışması ve deterministik port yönlendirme (6850..6853).',
    'Derleyici Ön-Kontrolü (--check-only ~200ms), 3-Kademeli Test Piramidi ve Yetim Düğüm Bellek Radarı.',
    'Sıfır-Token 4-En-Boy Oranlı Duyarlı UI Telemetrisi ve Playtest-Before-PR kalite kapısı.'
  ],
  content: [
    '## 🎮 Godot 4.x Oyun Motoru Köprüsü (Substrate 3.0)',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 5)]]** altında birleştirilmiştir.',
    '',
    'Aegis, modern oyun geliştirme projelerinde kör dosya manipülasyonu yerine canlı çalışan Godot motoruyla tam entegre Substrate 3.0 köprüsü sunar:',
    '',
    '- **Çift Yönlü WebSocket Köprüsü:** Canlı motor içi durum manipülasyonu, sahne ağacı (`aegis_godot_tree`), sinyal sözleşmeleri (`aegis_godot_signals`) ve dinamik eval (`aegis_godot_eval`).',
    '- **Deterministik Port Yönlendirici:** Paralel worktree\'lerin çakışmaması için sabit port rotası (solver: `6850`, qa: `6851`, docs: `6852`, ui: `6853`).',
    '- **Derleyici Ön-Kontrolü (`aegis_godot_validate`):** `--headless --check-only` ile 200ms altında sözdizimi doğrulaması.',
    '- **Yetim Düğüm Bellek Radarı:** Her test oturumunda sızan sahipsiz nesneleri anında yakalar.',
    '- **Sıfır-Token UI Telemetrisi (`aegis_godot_inspect_ui`):** 4 standart çözünürlük oranında taşma ve minimum dokunma hedefi denetimi.',
    '',
    'Detaylı şemalar ve Godot Substrate 3.0 araçları için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis godot status`: Godot motor yolu ve köprü bağlantı durumunu raporlar.',
    '- `aegis godot validate <dosya>`: GDScript dosyasını motor derleyicisiyle doğrular.',
    '- `aegis godot inspect`: Sıfır-token BoundingBox UI analizi yapar.',
    '- `aegis verify:task [dosya]`: Demir Kafes ve Headless Playtesti bir arada doğrular.'
  ].join('\n')
};
