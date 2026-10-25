# 🏛️ RFC-007: Fortified 5-Layer Codebase Memory IDE Integration Engine
### Aegis Autonomous Architecture Blueprint & Living Memory

- **RFC ID:** RFC-007 | **Durum:** Implemented (Tamamlandı) ✅ | **Tarih:** 2026-10-25 | **Origin:** User Architectural Proposal & Meta-Reflex
- **Tartışma:** [Discussion #61](https://github.com/frkntlr/aegis/discussions/61) | **Çözülen Issue:** [#62](https://github.com/frkntlr/aegis/issues/62)

---

## 🔍 1. Fikir ve Problem Tanımı (Diagnosis & Core Thesis)

IDE'lere entegre edilen geleneksel Codebase-Memory (Kod Tabanı Hafızası) çözümleri 5 kritik zaaf barındırmaktadır:
1. **Vektörel Körlük (Semantic vs. Structural):** Yalnızca metin/vektör benzerliği (RAG) aramak; AST sınıf kalıtımını, fonksiyon çağrı zincirlerini (call-graph), Godot sahne-sinyal (`.tscn` / `signal`) bağlarını ve tip hiyerarşisini kaçırır.
2. **Bayat Önbellek (Stale Cache & Worktree Desync):** Kodda satır değiştiğinde veya izole Git Worktree (solver/qa) dalları arasında geçiş yapıldığında eski indekslerin kullanılması ve halüsinasyon üretilmesi.
3. **Bağlam Şişmesi (Token Bloat):** Bir metodu anlamak için tüm dosyanın (1000+ satır) prompt'a dökülmesi ve LLM'in dikkat penceresini (attention span) tüketmesi.
4. **Motor/Dil Uyumsuzluğu ve Hayali API Çağrıları:** Motorun (örn. Godot 4 vs Godot 3) sürüm farklarını bilmeyen bellek yüzünden `instance()` yerine `instantiate()` gibi hatalı/eski fonksiyonların önerilmesi.
5. **Spagetti ve Parçalı Kod Üretimi:** Hafızadaki kodu yerel mimari kuralları (Demir Kafes kısıtlamaları, Max 300 satır) denetlemeden doğrudan LLM'e sunup kontrolsüz yamalar üretmek.

Bu RFC, söz konusu 5 zaafı kökten gideren **5 Katmanlı Birleşik Codebase-Memory Motoru (`CodebaseMemoryOrchestrator`)** mimarisini ve CLI/IDE arayüzlerini tanımlar.

---

## 🏗️ 2. Düğüm & Bileşen Mimarisi (5-Layer Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        IDE MEMORY ORCHESTRATOR                         │
├────────────────────────────────────────────────────────────────────────┤
│ Katman 1: Canlı AST & Hiyerarşik Graf  │ CodeGraphContext + Graphify  │
│ Katman 2: Artımlı Senkronizasyon (FS)  │ Incremental Hash & Worktree  │
│ Katman 3: Cerrahi Slice & RTK Sıkıştırma│ AstSkeleton + RTK Killer    │
│ Katman 4: Ground-Truth Motor Çapası    │ Context7 (Godot 4.3 / TS)    │
│ Katman 5: Demir Kafes Kalite Muhafızı  │ IronCage & Constitution      │
└────────────────────────────────────────────────────────────────────────┘
```

### Katman 1: İlişkisel ve Yapısal Graf İndeksleme
- Sınıflar, arayüzler, fonksiyonlar, Godot sahne düğümleri (`Node2D`, `Control`) ve bağlı sinyaller (`signal -> emit -> connect`) ilişkisel graf düğümleri olarak indekslenir.
- Bir sembol arandığında sembol gövdesi ile birlikte **Callers**, **Callees** ve **Blast Radius** anlık çıkarılır.

### Katman 2: Olay Güdümlü Artımlı Önbellek (Incremental Hash & Worktree Watcher)
- Her kaynak dosya için SHA-256 tabanlı AST parmak izi (fingerprint) tutulur.
- Sadece değişen dosyanın ve o dosyanın 1. derece bağımlılarının graf düğümleri güncellenir (<50ms).
- Git Worktree (`master`, `aegis/solver`, `aegis/qa`) bazlı ayrı bellek namespace'leri tutularak dallar arası kod karışıklığı engellenir.

### Katman 3: Cerrahi Dilimleme ve RTK Token Sıkıştırma (Surgical Memory Slice)
- `AstSkeleton`: Dosyanın tamamı yerine tipler, fonksiyon imzaları ve hedef sembolün gövdesi dilimlenerek (slice) bağlama eklenir (ortalama %70-85 token tasarrufu).
- `RTK (Rust Token Killer)`: Belleğe yazılan terminal çıktıları, test sonuçları ve derleme loglarındaki `node:internal` yığınları ve ANSI kodları elenir.

### Katman 4: Ground-Truth Motor ve Kütüphane Çapası (Context7 Entegrasyonu)
- Bellek bir sembol veya motor sınıfı (`PackedScene`, `CharacterBody2D`, vb.) algıladığında Context7 yerleşik dokümantasyon köprüsünden kütüphanenin resmi kurallarını ve kırıcı değişikliklerini otomatik çeker ve prompt bağlamına katar.

### Katman 5: Demir Kafes (Iron Cage) Standartları ile Spagetti Engelleme
- Hafızadan LLM'e sağlanan her görev bağlamına projenin Anayasası (Constitution) otomatik eklenir:
  - Max 300 satır/dosya, max 40 satır/fonksiyon.
  - Yukarı doğru iletişimde `get_parent()` yasak; sinyal (`signal`) zorunlu.
- Üretilen kod anında AST linter ve Demir Kafes denetleyicisi ile doğrulanır.

---

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon.
- Cerrahi unified diff ve sıfır bayat önbellek prensibi.
- Pre-commit test ve mutasyon kapısı geçişi zorunlu.

---

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] `CodebaseMemoryOrchestrator` sınıfı `packages/core/ast-skeleton` içinde 5 katmanı birleştirecek şekilde inşa edildi.
- [x] Artımlı SHA-256 tabanlı parmak izi ve worktree namespace desteği eklendi.
- [x] Context7 çapa enjeksiyonu ve RTK token killer temizliği hafıza sorgularına entegre edildi.
- [x] CLI komutu `aegis memory:query <symbol>` ve `aegis memory:stats` hayata geçirildi.
- [x] Antigravity ve IDE araç şemalarına `memory_query` MCP aracı eklendi.
- [x] Kapsamlı birim testleri hazırlandı ve %100 Demir Kafes / Mutasyon uyumluluğu sağlandı.
