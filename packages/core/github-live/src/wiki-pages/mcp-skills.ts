import type { WikiSuitePage } from '../types.js';

export const MCP_SKILLS_PAGE: WikiSuitePage = {
  slug: 'MCP-and-Skills-Ecosystem',
  title: 'Evrensel MCP & Beceri (Skills) Senkronizasyon Motoru',
  threeBullets: [
    'Tek komutla tüm editörlerde araç ve beceri eşitleme: aegis ide:sync.',
    'MCP Güvenlik Yöneticisi: İzin listesi, hız sınırlaması ve yıkıcı komut engelleme.',
    'Özel Ajan Rolleri: QA Hunter, Issue Solver, UI Specialist ve Doc Architect.'
  ],
  content: [
    '## 🔌 Evrensel MCP & Beceriler (Skills) Ekosistemi',
    '',
    'Model Context Protocol (MCP) ve Ajan Becerileri (Skills), yapay zekâ modellerinin dış dünya ile etkileşim kurmasını sağlayan temel sinir uçlarıdır. Aegis, bu araçların güvenli, kontrollü ve tüm editörlerde senkronize biçimde çalışmasını yönetir.',
    '',
    '### 1. Çapraz-Editör Senkronizasyonu (`aegis ide:sync`)',
    'Geliştirici ortamında `aegis ide:sync` çalıştırıldığında:',
    '1. Sistemdeki global ve yerel MCP sunucularını (`notebooklm-mcp-server`, `godot-mcp`, `godot-mcp-runtime`, `github` vb.) keşfeder.',
    '2. Projede tanımlı olan tüm uzman becerileri (`.gemini/config/skills/*`) listeler.',
    '3. Desteklenen tüm IDE yapılandırmalarına (`.cursor/mcp.json`, `.codeium/windsurf/mcp_config.json`, `.vscode/mcp.json`) tek bir komutla eksiksiz aktarır.',
    '',
    '---',
    '',
    '### 2. Deterministik MCP Güvenlik Yöneticisi (`MCPSecurityManager`)',
    'Otonom ajanların harici araçları rastgele çağırması sisteme veya depoya zarar verebilir. Aegis şu güvenlik katmanlarını zorunlu kılar:',
    '',
    '- **İzin Listesi (Allowlist):** Ajanlar yalnızca önceden yetkilendirilmiş araçları çağırabilir. Yetkisiz araç çağrıları engellenir ve uyarılır.',
    '- **Yıkıcı Komut Engeli:** Dosya sistemini kökten silen (`rm -rf`, formatlama), git geçmişini bozan veya kilitlenmemiş dosyaları değiştirmeye kalkan çağrılar anında reddedilir.',
    '- **Hız Sınırlaması (Rate Limiting):** GitHub REST/GraphQL ve harici LLM sağlayıcılarına aşırı istek gönderilmesini önlemek amacıyla token-bucket hız sınırlayıcı uygulanır.',
    '',
    '---',
    '',
    '### 3. Uzmanlaşmış Ajan Rolleri Matrisi',
    '',
    '| Ajan Rolü | Birincil Beceriler | Görev Tanımı | Çalışma Alanı |',
    '|---|---|---|---|',
    '| **`alice` (Issue Solver)** | `solver`, `godot-runtime`, `ast-skeleton` | Hata çözümü, TDD testleri, Demir Kafes uyumu | `experimental/alice` |',
    '| **`bob` (QA Hunter)** | `qa`, `telemetry-tester`, `godot-runtime` | Görsel UI denetimi, BoundingBox çakışma tespiti, girdi simülasyonu | `experimental/bob` |',
    '| **`contributor` (Doc Architect)** | `docs`, `github-live`, `notebooklm` | Yaşayan Wiki bakımı, topluluk RFC değerlendirmesi, karar kayıtları | `experimental/contributor` |',
    '| **`ui-specialist`** | `ui`, `godot-runtime` | Container/Anchor standartları, tema (*.tres) ve CSS düzenlemeleri | İzole UI Worktree |',
    '',
    'Bu rol matrisi sayesinde bir hata çözülürken QA Hunter oyunu veya arayüzü denetler, Doc Architect ise yapılan değişiklikleri yaşayan GitHub Wiki belleğine kaydeder.'
  ].join('\n')
};
