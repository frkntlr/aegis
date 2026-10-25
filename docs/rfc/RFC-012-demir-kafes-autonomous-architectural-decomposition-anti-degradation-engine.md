# 🏛️ RFC-012: Demir Kafes Autonomous Architectural Decomposition & Anti-Degradation Engine
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-012 | **Durum:** Proposed | **Tarih:** 2026-10-25 | **Yazar:** Aegis Autonomous Engine
- **GitHub Discussion:** [#221 (Ideas)](https://github.com/frkntlr/aegis/discussions/221)

---

## 🔍 1. Fikir ve Problem Tanımı

Aegis Deterministik Demir Kafes Anayasası, kod karmaşıklığını ve halüsinasyon riskini dizginlemek için iki sert sınır uygular:
- **Azami 300 satır / kaynak dosya**
- **Azami 40 satır / fonksiyon veya metot**

Ancak bu sınırlar aşıldığında sistemin körlemesine ya da mekanik biçimde satır bölmesi (arbitrary line slicing) yapması durumunda şu ciddi riskler ve kalite kayıpları ortaya çıkabilir:
1. **Bilişsel Parçalanma (Cognitive Fragmentation & Micro-File Hell):** Anlamsal bütünlüğü olmayan onlarca 15-20 satırlık dosya türemesi ve LLM bağlam penceresinin dosya takibiyle boşa harcanması.
2. **Kapsam ve Durum Yırtılması (Scope & Invariant Rupture):** Sınıf içi `private` alanların dışarı saçılması, enkapsülasyonun bozulması ve durum tutarsızlıkları.
3. **Döngüsel Bağımlılık Sarmalı (Circular Dependency Spaghetti):** Ayrıştırılan parçaların birbirini karşılıklı import etmesiyle çalışma zamanı çökmeleri.
4. **Boş Sarmalayıcı Halüsinasyonu (Hollow Wrapper Hallucination):** Sadece satır sınırını tutturmak için yapılan sahte ara çağrılar (passthrough wrappers).

Bu RFC, Demir Kafes sınırları zorlandığında kodun mantık hataları ve kalite kaybı yaşamadan **POP (Protocol-Oriented Programming)**, **Delegasyon**, **Strateji** ve **Cerrahi Ayrıştırma** kalıplarıyla güvenli ve modüler biçimde yeniden yapılandırılmasını sağlayan Otonom Mimari Ayrıştırma Motorunu tanımlar.

---

## 🏗️ 2. Demir Kafes Kalkanının Davranış Hiyerarşisi

Demir Kafes (`IronCageValidator`), iki seviyeli deterministik bir güvenlik modeliyle çalışır:

### A. Proaktif Kota ve Kapasite Radarı (Proactive Quota Alert)
- Ajan bir dosyayı değiştirmeden önce `aegis memory:query <symbol>` çağırdığında, 5-Katmanlı Kod Hafızası dosyanın mevcut durumunu inceler.
- Örnek: `codebase-memory.ts` 298 satırdaysa:
  `⚠️ Hedef Dosya: 298 satır -> Bu dosyaya EN FAZLA 2 satır ekleyebilirsiniz!` uyarısı üretir.
- Bu sayede ajan sınır aşılmadan önce proaktif olarak yeni alt sınıf / delege oluşturmaya yönlendirilir.

### B. Sert Doğrulama Kapısı (Pre-Commit / Pre-Push Gate)
- Dosya 300 satırı veya metot 40 satırı aştığında,
- Kontrol akış derinliği 4'ü aştığında (`TS_003_NESTING_DEPTH`),
- Açık `any` türü kullanıldığında (`TS_001_NO_ANY`),
- Yorumsuz boş `catch` bloğu tespit edildiğinde (`TS_002_EMPTY_CATCH`),
- %150'den fazla diff ile cerrahi olmayan tam dosya baştan yazımı yapıldığında (`FULL_FILE_REWRITE`),
commit derhal reddedilir (`exit code 1`). Hiçbir kirli veya standart dışı kod depoya giremez.

---

## 💡 3. Otonom Mimari Ayrıştırma Kalıpları (Decomposition Recipes)

Demir Kafes sınırlarına ulaşıldığında uygulanacak deterministik mimari desenler:

### A. Sınıf Seviyesinde: Cephe (Facade) ve Delegasyon Kalıbı
- **Kural:** 300 satırı aşan sınıflar derin miras (inheritance) hiyerarşisiyle değil, **bileşim (composition)** ve delegasyonla ayrıştırılır.
- **Uygulama:** Ana sınıf dış dünyaya temiz, kararlı bir arayüz (`Facade`) sunmaya devam eder; iç iş mantığını bağımsız sorumluluk sınıflarına (Single Responsibility Principle) devreder:
  - Örnek: `CodebaseMemoryEngine` (298 satır) büyüyeceğinde, cold-start mantığı `ColdStartIndexer` sınıfına, write-through mantığı `MemoryWriteThroughHook` sınıfına devredilir. Ana sınıf yalnızca tek satırlık koordinasyon sağlar.

### B. Arayüz Seviyesinde: Protokol Odaklı Programlama (POP / Protocol-Oriented)
- **Kural:** Bileşenler somut sınıflara değil, sözleşmelere (`interface` / protokol) bağlanır.
- **Uygulama:** Yeni özellikler eklenirken ana sınıfa if/switch blokları yığmak yerine bağımsız protokol uygulayıcıları eklenir:
  - Örnek: `SkeletonGenerator` içerisine yeni diller eklenirken ana sınıf büyümez; her dil `LanguageExtractor` protokolünü uygulayan bağımsız dosyalarda (`csharp-extractor.ts`, `bash-extractor.ts`) yaşar.

### C. Metot Seviyesinde: Guard Clause ve Cerrahi Çıkarma (Extract-Method)
- **Kural:** 40 satırı aşan metotlarda iç içe `if/else` blokları guard clause ile erken döndürülür (`return`), kontrol akış derinliği 1'e indirilir.
- Bağımsız veri işleme veya döngü gövdeleri, yan etkisi olmayan saf `private static` yardımcı fonksiyonlara çıkarılır.

---

## 🛡️ 4. Mantık Hatası ve Kalite Kaybına Karşı Güvenlik Supabı: Zero-Degradation Gate

Ayrıştırma işlemi sırasında sistemin semantik bütünlüğünü korumak için 3 aşamalı doğrulama zorunludur:

1. **Birim Test Regresyon Güvencesi:** Ayrıştırma öncesinde geçen tüm birim testler ayrıştırma sonrasında da %100 geçmelidir.
2. **Mutasyon Test Kapısı (Mutation Testing Gate):** Ayrıştırılan kod üzerinde üretilen tüm mutantlar (%100 Kill Score) testler tarafından yakalanmalıdır. Bu kapı, ayrıştırma sırasında ölü kod, uydurma logic veya eksik assertion oluşmasını kesin olarak engeller.
3. **Cerrahi Unified Diff Denetimi:** Sadece taşınan ve ayrıştırılan sembollerin diff'i commit edilebilir; kapsam dışı dosya değişiklikleri engellenir.

---

## 🔒 5. Demir Kafes Standartları
- Azami 300 satır / kaynak dosya.
- Azami 40 satır / fonksiyon veya metot.
- Maksimum iç içe geçme derinliği <= 4 (Guard clauses mandatory).
- Sıfır açık `any`, sıfır yorumsuz boş `catch`.

---

## 🎯 6. Kabul Kriterleri (Acceptance Criteria)
- [ ] Demir Kafes mimari ayrıştırma protokolü dokümante edildi ve GitHub Discussion #221 üzerinde yayımlandı.
- [ ] Popüler diller (.ts, .gd, .cs, .py) için POP, Delegasyon ve Extract-Method reçeteleri belirlendi.
- [ ] Mutasyon Test Kapısı (%100 Kill Score) ile mimari ayrıştırmanın regresyon üretmediği doğrulandı.
- [ ] Proje genelindeki 265 dosya %100 Demir Kafes uyumluluğunu korumaktadır.
