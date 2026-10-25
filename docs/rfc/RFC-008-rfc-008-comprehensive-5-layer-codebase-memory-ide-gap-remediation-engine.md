# 🏛️ RFC-008: Comprehensive 5-Layer Codebase Memory & IDE Gap Remediation Engine
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-008 | **Durum:** Implemented (Tamamlandı) | **Tarih:** 2026-10-25
- **Tartışma:** [Discussion #63](https://github.com/frkntlr/aegis/discussions/63) | **Çözülen Issue:** [#64](https://github.com/frkntlr/aegis/issues/64) | **Commit:** `f4c7c8a`

---

## 🔍 1. Fikir ve Problem Tanımı
Aegis 5-Katmanlı Codebase Memory motorunda tespit edilen MCP yönlendirme, kebab-case sembol arama, Godot `.tscn` indeksleme, silinen dosyaların önbellek tazeliği ve Context7 konu genişletmesi açıklarının uçtan uca kapatılması.

---

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)
1. **MCP Security & Dispatcher:** JSON-RPC tool çağrılarının tam parametrik eşleşmesi (`find_symbol`, `trace_relational`, `triage`, `memory_query`).
2. **Kebab-Case & Fuzzy Indexing:** Sembol adlarının tireli (`kebab-case`), alt çizgili (`snake_case`) ve bitişik halleriyle aranabilmesi.
3. **Godot Scene & Signal Indexing:** `.tscn` ve `.tres` sahnelerindeki sinyal bağlantılarının AST ilişkisel grafına entegrasyonu.
4. **Deleted-File Cache Invalidation:** Silinen dosyaların bellek önbelleğinden anında temizlenmesi.
5. **Context7 Documentation Anchor:** Güncel kütüphane dokümantasyonu çapasıyla halüsinasyonların engellenmesi.

---

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon kuralına %100 uyum.

---

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] MCP sunucusu JSON-RPC araç çağrıları doğrulandı.
- [x] Kebab-case ve çoklu isimlendirme formatlarında sembol arama eklendi.
- [x] `.tscn` sahne düğümleri ve sinyal ilişkileri grafa bağlandı.
- [x] Dosya silinmelerinde önbellek geçersiz kılma mantığı eklendi.
- [x] Demir Kafes ve mutasyon testlerinden %100 ile geçerek `master` dalına birleştirildi.
