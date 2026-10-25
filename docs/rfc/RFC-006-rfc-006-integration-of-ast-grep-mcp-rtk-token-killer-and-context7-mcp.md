# 🏛️ RFC-006: Integration of ast-grep MCP, RTK Token Killer, and Context7 MCP
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-006 | **Durum:** Implemented (Tamamlandı) ✅ | **Tarih:** 2026-10-25
- **Tartışma:** [Discussion #59](https://github.com/frkntlr/aegis/discussions/59) | **Çözülen Issue:** [#60](https://github.com/frkntlr/aegis/issues/60)

## 🔍 1. Fikir ve Problem Tanımı
Aegis otonom kodlama motorunun yüksek doğruluklu AST manipülasyonu, terminal gürültüsü filtrelemesi ve güncel kütüphane dokümantasyonu yeteneklerini en üst seviyeye çıkarmak için 3 kritik güç merkezinin entegrasyonu:
1. **ast-grep MCP (AST Yazma & Refactoring):** Tree-sitter tabanlı yapısal desen eşleme (structural pattern matching), kurallarla denetim (lint) ve regex kırılganlığı olmayan cerrahi AST refactoring.
2. **RTK (Rust Token Killer - Terminal Çıktısı Sıkıştırıcı):** Test, derleyici (tsc, cargo, godot) ve terminal çıktılarını filtreleyerek ANSI kodlarını, dahili stack trace gürültüsünü (`node:internal`, framework internals) ve tekrarlayan başarılı testleri budayan, token tüketimini %85-%95 oranında azaltan sıkıştırma motoru.
3. **Context7 MCP (Güncel Motor & Kütüphane Dokümanı):** Modelin eğitim kesintisi veya eski API sürümleri (ör. Godot 3 vs 4) nedeniyle halüsinasyon görmesini engelleyen, güncel kütüphane dokümanlarını bağlama dinamik enjekte eden dokümantasyon köprüsü.

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)
1. **`AstGrepBridge` (`@aegis/ast-skeleton`):**
   - Yapısal AST desen sorgulama (`find`), cerrahi değiştirme (`replace`) ve kural denetimi (`lint`).
   - `UniversalToolchainSync` üzerinden `.cursor/mcp.json`, `.vscode/mcp.json` yapılandırmalarına `ast-grep` MCP sunucusu tanımı.
   - CLI arayüzü: `/aegis ast:search <pattern>` ve `/aegis ast:replace <pattern> <rewrite>`.

2. **`TokenKillerEngine` (RTK - `@aegis/watchdog` / `@aegis/shared`):**
   - ANSI strip, stack trace budama (`node:internal`, `turborepo` gürültüsü), test koşucusu özetleme (geçen testleri tek satırda birleştirme, hata ve diff'leri öne çıkarma).
   - Derleyici tanı (diagnostic) ayıklama (yalnızca hata satırları ve kaynak konumları).
   - CLI arayüzü: `/aegis rtk:compress [file]` ve prompt derleyicide otonom terminal sıkıştırma.

3. **`Context7Bridge` (`@aegis/github-live`):**
   - Kütüphane ve motor dokümantasyon sorgusu (`queryDocs`).
   - Disk önbelleği (`.aegis/cache/context7/`) ve yerel çevrimdışı fallback (Godot ClassDb).
   - CLI arayüzü: `/aegis context7:query "<library>" "<topic>"`.
   - `prompt-command.ts` bağlam derleyicisine otomatik doküman injeksiyonu.

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon.
- Cerrahi unified diff'ler ve 0 derleme/test hatası.
- %100 birim test geçişi ve MutationGate $\ge 70\%$.

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] `ast-grep` MCP tanımı ve `AstGrepBridge` yapısal arama/değiştirme motoru eklendi.
- [x] RTK Token Killer terminal çıktısı sıkıştırma motoru geliştirildi ve birim testlerle doğrulandı.
- [x] Context7 MCP sağlayıcısı ve `Context7Bridge` entegre edildi.
- [x] `UniversalToolchainSync` tüm IDE'ler için `ast-grep` ve `context7` sunucularını senkronize etti.
- [x] `/aegis` CLI komutları (`ast:search`, `ast:replace`, `rtk:compress`, `context7:query`) eklendi.
- [x] Tüm paketler derlendi, testler %100 geçti, Demir Kafes denetimi sağlandı.
