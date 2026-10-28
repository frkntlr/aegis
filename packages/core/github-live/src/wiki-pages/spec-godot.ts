/**
 * @file spec-godot.ts
 * Specification: Godot Engine High-Performance Substrate 3.0.
 * Covers: RFC-002, RFC-035.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_GODOT_PAGE: WikiSuitePage = {
  slug: 'Spec-Godot-Substrate',
  title: 'Mimari Spesifikasyon: Godot Substrate 3.0 & Çift Yönlü Motor Köprüsü',
  threeBullets: [
    'Godot Substrate 3.0: Çift yönlü WebSocket köprüsü, deterministik port yönlendirme (6850..6853) ve tek seferlik token el sıkışması.',
    'Derleyici Ön-Kontrolü (--check-only ~200ms), 3-Kademeli Test Piramidi ve Yetim Düğüm Bellek Radarı.',
    'Kapsanan Kararlar: RFC-002 (Aegis Godot Bridge) ve RFC-035 (Godot Substrate 3.0 Quality Gates).'
  ],
  content: [
    '## 🎮 Mimari Spesifikasyon: Godot Substrate 3.0 & Motor Köprüsü',
    '',
    'Aegis, modern oyun geliştirme projelerinde kör dosya manipülasyonu veya ezbere GDScript yazımı yerine canlı çalışan oyun motoruyla tam entegre bir Substrate 3.0 köprüsü sunar. Bu spesifikasyon; RFC-002 ve RFC-035 kararlarının sentezidir.',
    '',
    '```mermaid',
    'flowchart LR',
    '  subgraph Host["Aegis CLI & MCP Host"]',
    '    PORT["Deterministik Port Yönlendirici (6850-6853)"]',
    '    PRE["Derleyici Ön-Kontrolü (--check-only ~200ms)"]',
    '    DOG["İşlem Ağacı Watchdog (Tree-Kill SIGKILL)"]',
    '  end',
    '  subgraph Engine["Godot 4.7 Motor Çalışma Zamanı"]',
    '    WS["Çift Yönlü WebSocket Köprüsü (:stdio / :ws)"]',
    '    RADAR["Yetim Düğüm Bellek Radarı (Orphan Delta)"]',
    '    UI["4-En-Boy Oranlı Duyarlı UI Denetimi"]',
    '  end',
    '  PORT <--> WS',
    '  PRE --> Engine',
    '  DOG --> Engine',
    '  Engine --> RADAR',
    '  Engine --> UI',
    '```',
    '',
    '---',
    '',
    '### 1. Çift Yönlü WebSocket Köprüsü & ClassDB Oracle (RFC-002)',
    '- **ClassDB Oracle:** Godot 4 yerleşik sınıflarını (`Node`, `Control`, `CharacterBody2D`, `Tween` vb.) metot ve sinyal imzalarıyla doğrular; halüsinasyonları 0\'a indirir.',
    '- **Canlı Durum Manipülasyonu:** Aktif oyundan sahne ağacı telemetrisini çeker (`aegis_godot_tree`), sinyal sözleşmelerini listeler (`aegis_godot_signals`) ve güvenli GDScript ifadeleri değerlendirir (`aegis_godot_eval`).',
    '',
    '---',
    '',
    '### 2. Deterministik Port Yönlendirici & Derleyici Ön-Kontrolü (RFC-035)',
    '- **İzole Port Ataması:** Paralel worktree\'ler çakışmasın diye sabit port yönlendirmesi uygulanır (solver: `6850`, qa: `6851`, docs: `6852`, ui: `6853`).',
    '- **200ms Derleyici Ön-Kontrolü (`aegis_godot_validate`):** `--headless --check-only` bayrağı ile sahneleri başlatmadan önce sözdizimi ve tip hatalarını 200 milisaniye altında yakalar.',
    '',
    '---',
    '',
    '### 3. 3-Kademeli Test Piramidi & Bellek Radarı (RFC-035)',
    '- **GUT / GdUnit4 Test Piramidi:** Birim testler, entegrasyon testleri ve deterministik uçtan uca playtest (`--fixed-fps 60 --time-scale 5.0`).',
    '- **Yetim Düğüm Bellek Radarı:** Her playtest oturumunda `Performance.get_monitor(MONITOR_OBJECT_ORPHAN_NODE_COUNT)` ile sızan sahipsiz nesneleri anında yakalar.',
    '- **Sıfır-Token UI Telemetrisi (`aegis_godot_inspect_ui`):** 16:9, 16:10, 21:9 ve mobil dikey ekranlarda BoundingBox çakışma ve minimum 44px dokunma hedefi denetimi.',
    '',
    '---',
    '',
    '### 💻 Godot Substrate 3.0 MCP Araçları Referansı',
    '| MCP Aracı | Parametreler | Görev |',
    '|---|---|---|',
    '| `aegis_godot_status` | Yok | Godot 4 motor yolu, sürüm ve köprü bağlantı durumunu sorgular. |',
    '| `aegis_godot_validate` | `filePath` (str) | GDScript dosyasını motorun yerel derleyicisiyle (~200ms) doğrular. |',
    '| `aegis_godot_playtest` | `projectDir`, `scenarioPath` | Deterministik senaryo testini koşturur ve çökme denetimi yapar. |',
    '| `aegis_godot_inspect_ui` | `projectDir`, `minTouchTarget` | 4 standart ekranda sıfır-token responsive layout analizi yapar. |',
    '| `aegis_godot_tree` | `tscnPath` (str) | SceneTree hiyerarşisini canlı oturumdan veya dosyadan inceler. |',
    '| `aegis_godot_signals` | `className` (str) | ClassDB üzerinden sinyal sözleşmelerini ve dinleyicilerini listeler. |',
    '| `aegis_godot_screenshot` | `outputPath` (opt) | Canlı oyundan yüksek çözünürlüklü framebuffer ekran görüntüsü alır. |',
    '| `aegis_godot_eval` | `expression` (str) | Aktif oturumda güvenli GDScript ifadesi değerlendirir. |'
  ].join('\n')
};
