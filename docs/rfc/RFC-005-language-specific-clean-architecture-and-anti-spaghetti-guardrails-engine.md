# 🏛️ RFC-005: Language-Specific Clean Architecture and Anti-Spaghetti Guardrails Engine
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-005 | **Durum:** Approved | **Tarih:** 2026-10-25
- **Tartışma:** [Discussion #57](https://github.com/frkntlr/aegis/discussions/57) | **Takip Eden Issue:** [#58](https://github.com/frkntlr/aegis/issues/58)

---

## 🔍 1. Fikir ve Problem Tanımı
Yapay zeka modelleri kod yazarken veya hata çözerken sıklıkla geçici yamalar (band-aid fixes), 'any' hileleri, doğrudan üst düğüm erişimleri (`$"../../"`) ve iç içe spagetti yapılar üretebilmektedir. Bu durum teknik borç yaratmakta ve kod kalitesini düşürmektedir.

RFC-005, iki katmanlı hibrit bir kalkan getirir:
1. **Dinamik Mimarili Görev Kılavuzu (Dynamic Prompt Constitution):** Ajanlara görev atanırken hedeflenen dile (Godot 4 Bileşen Mimarisi veya TypeScript Temiz Alan Modeli) özel temiz kod anayasasının prompta cerrahi olarak eklenmesi.
2. **Deterministik Demir Kafes Denetim Kapısı (Anti-Spaghetti AST Gates):** Kod commit edilmeden önce spagetti, yutulan hatalar, 'any' ve sıkı düğüm bağımlılıklarını yakalayıp reddeden kural seti.

---

## 🏗️ 2. Standartlar ve Kural Seti

### A. Godot 4 Ultra-Katı Bileşen Standartları
- **`GD_007_COUPLING_PARENT_NODE`:** `$"../"` veya `get_node("../")` kullanımı kesinlikle yasaktır. Yukarı yönlü iletişim sinyallerle, aşağı yönlü iletişim `@export` referanslarıyla yapılmalıdır.
- **`GD_008_TYPED_GDSCRIPT`:** Fonksiyon parametreleri ve dönüş tipleri (`-> void`, `-> int`, vb.) zorunlu tiplendirilmelidir.
- **`GD_009_BAND_AID_PREVENTION`:** Bellek ve yaşam döngüsü güvenliği; semptomları `is_instance_valid` ile sarmalamak yerine kök neden modelinde çözümleme zorunluluğu.

### B. TypeScript / Node.js Temiz Kod Standartları
- **`TS_001_NO_ANY`:** `any` veya `as any` tip kaçışları tamamen yasaktır.
- **`TS_002_EMPTY_CATCH`:** Hataları sessizce yutan boş `catch {}` blokları yasaktır; hata işlenmeli veya uygun şekilde loglanmalıdır.
- **`TS_003_NESTING_DEPTH`:** İç içe blok derinliği en fazla 3 olabilir (erken dönüş / early return zorunluluğu).

---

## 🎯 3. Kabul Kriterleri (Acceptance Criteria)
- [ ] Hedeflenen dosya tipine göre dinamik temiz mimari anayasası üreten `LanguageConstitutionGenerator` modülü.
- [ ] Godot 4 için `GD_007` ve `GD_008` AST kurallarının `gdscript-rules.ts` içine eklenmesi.
- [ ] TypeScript için `TS_001`, `TS_002` ve `TS_003` AST kurallarının `clean-architecture-rules.ts` içinde uygulanması.
- [ ] Tüm yeni kuralların birim testlerle doğrulanması.
- [ ] Demir Kafes %100 uyumluluğu ve izole worktree (`experimental/solver`) boru hattından geçiş.
