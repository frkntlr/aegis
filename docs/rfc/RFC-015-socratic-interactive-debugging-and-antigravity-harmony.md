# 🏛️ RFC-015: Socratic Interactive Debugging CLI, Anti-Hang ast-grep Safeguards & Antigravity MCP Harmony
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-015 | **Durum:** Implemented / Accepted ✅ | **Tarih:** 2026-10-26
- **Hedef Paket:** `@aegis/cli`, `@aegis/dialogue-engine`, `@aegis/ast-skeleton`, `@aegis/orchestrator`
- **İlgili Tartışma:** [GitHub Discussion #237](https://github.com/frkntlr/aegis/discussions/237)

---

## 🔍 1. Fikir ve Problem Tanımı (Vision & Core Problem)
Geliştiricilerin ve yapay zeka ajanlarının karşılaştığı runtime çökmeleri, yığın izi karmaşaları ve Antigravity araç zinciri uyumsuzluklarını çözmek üzere geliştirilen interaktif Sokratik teşhis ve anti-hang güvenliği altyapısıdır.

1. **Anti-Hang Koruması:** `npx ast-grep` paketinin npm üzerindeki eski 2018 sürümünün STDIN bekleme tuzağının bertaraf edilmesi, yerel AST köprüsünün anonim `$$$` ve tekil `$` jokerleri desteklemesi.
2. **Sokratik Teşhis CLI:** `aegis debug [error-or-file]` ile kanıta dayalı, 3 turluk deterministik teşhis akışı.
3. **14-Araçlık MCP Genişlemesi:** Antigravity ve Aegis arasında tam uyum sağlayacak 14 MCP aracının JSON şemaları ve yönergelerinin oluşturulması.

## 🏗️ 2. Düğüm & Bileşen Mimarisi
- `handleDebugCommand`: Çok dilli stack frame ayrıştırması, semptom sınıflandırması ve kanıt odaklı hipotez sunumu.
- `AstGrepBridge`: Regex destekli anonim wildcard dönüşümü ve `ast-grep` / `sg` CLI alias entegrasyonu.
- `mcp-server-command`: 14 araçlık MCP araç listesi ve JSON-RPC 2.0 dinleyicisi.

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon.
- Sıfır `any`, tam tip güvenliği.
- %100 Mutasyon Testi Başarısı.

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] Sokratik 3 turluk teşhis akışı CLI'a bağlandı.
- [x] Anonim `$$$` wildcard desteği `AstGrepBridge` içine eklendi.
- [x] 14 MCP aracının şeması ve testleri tamamlandı.
- [x] Çok kademeli atomik birleştirme ile master'a aktarıldı.
