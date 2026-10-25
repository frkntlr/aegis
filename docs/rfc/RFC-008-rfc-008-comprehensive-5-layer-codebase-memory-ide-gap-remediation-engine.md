# 🏛️ RFC-008: Comprehensive 5-Layer Codebase Memory & IDE Gap Remediation Engine
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-008 | **Durum:** Implemented (Tamamlandı) | **Tarih:** 2026-10-25
- **Tartışma:** [Discussion #63](https://github.com/frkntlr/aegis/discussions/63) | **Çözülen Issue:** [#64](https://github.com/frkntlr/aegis/issues/64) | **Commit:** `f4c7c8a`

---

## 🔍 1. Fikir ve Problem Tanımı
Aegis 5-Katmanlı Codebase Memory motorunda tespit edilen 7 kritik eksiklik ve mimari boşluk kapsamlı olarak giderilmiştir:
1. **MCP Dispatcher İkincil Araç Eksikliği:** JSON-RPC üzerinden `ast_replace`, `triage`, `find_symbol` ve `trace_relational` araç çağrılarının yönlendirilmemesi.
2. **Kebab vs PascalCase Eşleşme Kopukluğu:** Ajan promptlarında sembol ararken `kebab-case` veya dosya yolu formatındaki girdilerin `resolveSlice` ve `extractMemoryContext` içinde yakalanamaması.
3. **Çoklu Dil ve Godot Kaynak İndeksleme Kapsamı:** `.tscn`, `.tres`, `.rs`, `.go`, `.cpp` dosyalarının varsayılan dizin indeksleme kapsamı dışında kalması.
4. **Silinen Dosyaların Önbellek İhlali:** Bir dosya silindiğinde AST önbelleğinin bayat kalması ve hafıza sızıntısı yaratması.
5. **Context7 Konu Kapsamı:** `godot4::physics`, `godot4::ui` ve `typescript::clean-arch` konularında dinamik motor dokümantasyon eşleşmesinin eksikliği.
6. **Toolchain Senkronizasyonunda Geçici Dizin Sızıntısı:** Birim testlerin küresel `mcp_config.json` dosyasını geçici yollarla kirletme riski.
7. **Web Dashboard Araç Paritesi:** Web Dashboard Action Dispatcher'da `ast_search`, `rtk_compress` ve `context7_query` eylemlerinin bulunmaması.

---

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)

1. **`packages/core/mcp-security` & Dispatcher**:
   - `executeSecondaryTool` genişletilerek `ast_replace`, `triage`, `find_symbol`, `trace_relational` eklendi.
2. **`packages/core/ast-skeleton/src/codebase-memory-engine.ts`**:
   - `resolveSlice` içinde kebab/snake/dosya yolu fallback araması eklendi.
   - `removeFile(filePath)` metodu eklenerek silinen dosyaların AST ve graf düğümleri temizlendi.
3. **`packages/core/ast-skeleton/src/symbol-indexer.ts`**:
   - Varsayılan uzantılara `.tscn`, `.tres`, `.rs`, `.go`, `.cpp` eklendi.
4. **`packages/core/github-live/src/context7-bridge.ts`**:
   - `godot4::physics`, `godot4::ui` ve `typescript::clean-arch` konuları entegre edildi.
5. **`packages/core/orchestrator/src/toolchain-sync.ts`**:
   - `isTemp` denetimi eklenerek geçici test yollarının konfigürasyonlara yazılması engellendi.
6. **`packages/web-dashboard/src/server/action-dispatcher.ts`**:
   - `ast_search`, `rtk_compress` ve `context7_query` araçları UI kumanda merkezine bağlandı.

---

## 🔒 3. Demir Kafes Standartları
- Tüm değiştirilen dosyalar azami 300 satır/dosya ve 40 satır/fonksiyon kuralına %100 uyumludur.
- Mutasyon testlerinde 7 dosya üzerinde %100 mutant imha skoru (Kill Score) elde edilmiştir.

---

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] MCP sunucusu ve ikincil araçlar (`ast_replace`, `triage`, `find_symbol`, `trace_relational`) JSON-RPC seviyesinde entegre edildi.
- [x] Kebab-case, snake_case ve dosya fallback ile sembol dilimleme (`resolveSlice`) güçlendirildi.
- [x] Çoklu dil ve Godot `.tscn`, `.tres`, `.rs`, `.go`, `.cpp` indeksleme desteği genişletildi.
- [x] Dosya silinmelerinde artımlı bellek önbelleği anlık geçersiz kılma (`removeFile`) eklendi.
- [x] Context7 konu kapsamı (`physics`, `ui`, `clean-arch`) ve dinamik anahtar kelime eşleşmesi sağlandı.
- [x] Toolchain senkronizasyonunda geçici test dizini koruması (`isTemp`) eklendi.
- [x] Web Dashboard Action Dispatcher araç paritesi sağlandı.
- [x] Demir Kafes (%100 Clean) ve Mutasyon Test Kapısından (%100 Kill Score) onay alındı.
- [x] İzole worktree üzerinden 4-Aşamalı Atomik Pipeline ile `master` dalına birleştirildi (Commit: `f4c7c8a`).
- [x] GitHub Issue #64 başarıyla çözüldü ve kapatıldı.
