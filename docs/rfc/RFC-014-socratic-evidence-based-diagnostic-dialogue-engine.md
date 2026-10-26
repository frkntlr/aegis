# 🏛️ RFC-014: Socratic Evidence-Based Diagnostic Engine: Zero-Hallucination AST Triangulation & Surgical Context Synthesis
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-014 | **Durum:** Proposed | **Tarih:** 2026-10-26
- **Hedef Paket:** `@aegis/dialogue-engine` (ve bağlı `@aegis/ast-skeleton`, `@aegis/watchdog`, `@aegis/iron-cage`, `@aegis/orchestrator`)
- **İlgili Tartışma:** [GitHub Discussion #230](https://github.com/frkntlr/aegis/discussions/230)

---

## 🔍 1. Fikir ve Problem Tanımı (Vision & Core Problem)

### Mevcut Durum ve Problem
Aegis `@aegis/dialogue-engine` paketi, yapay zeka ajanları ve geliştiriciler için 3 turluk deterministik bir teşhis durum makinesi (`DialogueStateMachine`) sunmaktadır. Ancak mevcut implementasyon (`DialogueEngine`), tamamen yüzeysel metin eşleştirmelerine (`string.includes`) ve statik seçeneklere (`CATEGORY_OPTIONS`, `DEFAULT_PLANS`) dayanmaktadır.

Bu durum pratikte şu 3 kritik soruna yol açmaktadır:
1. **AI Halüsinasyonu (AI Hallucination):** Hata ayıklama oturumunda LLM, gerçek AST sembollerini, dosya yollarını, çağrı hiyerarşisini ve tip imzalarını göremediği için hedef dosya, fonksiyon ve çözüm adımlarını uydurmaktadır.
2. **Bağlam Eksikliği & Körlük (Context Blindness):** Teşhis motoru `@aegis/ast-skeleton` (CodebaseMemory), `@aegis/watchdog` (RTK Token-Killer), `@aegis/iron-cage` (Demir Kafes Kotası) ve `git` durumundan tamamen kopuk çalışmaktadır. Hangi fonksiyonun çöktüğünü, o fonksiyonu kimlerin çağırdığını (`CALLS` grafı) veya dosyanın kalan satır bütçesini bilmemektedir.
3. **Performans ve Token Şişmesi (Performance & Token Bloat):** LLM'e devasa yığın izleri (stack traces) veya tüm kaynak dosyalar döküldüğünde bağlam penceresi dolmakta, yanıt süreleri uzamakta ve modelin muhakeme yeteneği düşmektedir.

### Vizyon (Proposed Solution)
`DialogueEngine`'i statik bir şablon üreticisinden; **Sokratik, Kanıt-Güdümlü (Evidence-Based) ve Sıfır Halüsinasyonlu bir Teşhis Beynine** dönüştürmek:
- **Kanıt Triangülasyonu (AST Triangulation):** Ham yığın izini (stack trace), test çıktısını veya terminal logunu ayrıştırarak doğrudan ilgili AST sembolünü, dosyasını ve satırını saptamak.
- **İlişkisel Bağlam Sentezi:** `CodebaseMemoryEngine` üzerinden sembolün çağıranlarını (upstream callers), çağırdıklarını (callee signatures), geçişli tip kapanışını (`<ambient_types>`) ve Context7 resmi dokümanlarını otomatik harmanlamak.
- **Dinamik Falsifiye Edilebilir Hipotezler:** Sabit diziler yerine, toplanan gerçek AST/Git kanıtlarına dayalı somut hipotezler üretmek.
- **Cerrahi & Zırhlı Reçete (Armored Prescription):** LLM'e uydurma alanı bırakmayan; hedef worktree (`solver`/`qa`), kilitlenecek dosyalar (`WorktreeMutex`), cerrahi kod dilimi ve Demir Kafes satır bütçesi içeren net görevler üretmek.

---

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Architectural Topology)

```mermaid
flowchart TD
    subgraph INGEST["1. Çoklu-Modlu Kanıt Girişi (Evidence Ingestion)"]
        ERR["Ham Hata / Yığın İzi / Test Logu"] --> RTK["RTK Token-Killer (%90 Sıkıştırma)"]
        SYMP["Kullanıcı Semptom Metni"] --> RTK
    end

    subgraph TRIANGULATE["2. AST Üçgenlemesi & İlişkisel Tarama"]
        RTK --> STP["StackTraceParser (Dosya, Satır, Sembol Tespiti)"]
        STP --> MEM["CodebaseMemoryEngine (5-Katmanlı Hafıza)"]
        MEM --> REL["RelationalGraph (Upstream/Downstream Callers)"]
        MEM --> TYP["TransitiveTypeResolver (<ambient_types>)"]
        MEM --> BUD["LineBudgetRadar (Kalan Satır Kotası)"]
    end

    subgraph SOCRATIC["3. Sokratik Diyalog & Hipotez Çözümleme"]
        REL & TYP & BUD --> HYP_GEN["DynamicHypothesisGenerator"]
        HYP_GEN --> TURN1["Tur 1: Kanıta Dayalı Semptom Özeti"]
        TURN1 --> TURN2["Tur 2: Hedeflenmiş Cerrahi Netleştirme (Falsifiable Probing)"]
        TURN2 --> TURN3["Tur 3: Doğrulama & İnceleme"]
    end

    subgraph DISPATCH["4. Zırhlı Reçete & Görev Sevk (Prescription)"]
        TURN3 --> ARM_BUILDER["ArmoredPrescriptionBuilder"]
        ARM_BUILDER --> TASK["Yürütülebilir Aegis Görevi (.aegis/prompts/)"]
        ARM_BUILDER --> MUTEX["Worktree Mutex Kilitleri (.aegis/locks.json)"]
        ARM_BUILDER --> WORKTREE["Hedef Worktree (solver / qa / docs)"]
    end
```

### 1. `StackTraceParser` & `EvidenceCollector`
- Terminalden veya test çalışmasından gelen yığın izlerini ayrıştırır.
- `node:internal`, framework ve runtime gürültülerini filtreler.
- Hatanın patladığı kullanıcı kodunu (örneğin `packages/core/watchdog/src/watchdog.ts:42`) saptar.

### 2. `AstTriangulator`
- Saptanan dosya ve satırdan AST sembolünü (`FunctionDeclaration`, `MethodDeclaration`) çıkarır.
- `CodebaseMemoryEngine.query()` aracılığıyla:
  - Fonksiyonun gövdesini cerrahi dilimler.
  - Çağırdığı iç metotların imzalarını (`<callee_signatures>`) toplar.
  - Parametre tiplerini (`<ambient_types>`) ekler.
  - Resmi dokümanı (`Context7`) iliştirir.

### 3. `DynamicHypothesisGenerator`
- Statik şablonlar yerine, toplanan gerçek verilerle hipotezler kurar:
  - *Örnek:* "Fonksiyon `resetTimer` (satır 42), `options.timeoutMs` parametresinin `undefined` gelmesi sebebiyle `NaN` üretiyor. Dosyanın kalan Demir Kafes bütçesi: 18 satır."
- Kullanıcıya veya LLM denetçisine netleştirme seçenekleri sunar.

### 4. `ArmoredPrescriptionBuilder`
- Teşhis kesinleştiğinde üretilen reçete:
  - Hedef dosyanın tam yolu.
  - Kesin satır aralığı ve katlanmış iskelet.
  - Demir Kafes satır sınırı.
  - Otomatik worktree tahsisi (`experimental/solver`).
  - Dosya kilidi tanımları (`WorktreeMutex`).
  - Çalıştırılacak izole test komutu.

---

## ⚡ 3. Performans ve Token Verimlilik Analizi

| Metrik | Geleneksel LLM Hata Ayıklama | Mevcut DialogueEngine | Yeni Sokratik Teşhis Motoru |
| :--- | :--- | :--- | :--- |
| **Girdi Bağlam Boyutu** | 4,000 - 8,000 token (Büyük log ve tüm dosyalar) | ~100 token (Statik metin) | **120 - 180 token (Katlanmış AST + Sıkıştırılmış Log)** |
| **Bağlam Tasarrufu** | %0 (Tam Döküm) | Anlamsız (Kod yok) | **%97.5 Token Tasarrufu** |
| **Halüsinasyon Riski** | Yüksek (Bağlam kalabalığında kaybolma) | Çok Yüksek (Kod/sembol bilgisi sıfır) | **Sıfır (Zemin gerçeği AST + Tip kapanışı)** |
| **Doğruluk & İsabet** | Tahmini | Tahmini / Soyut | **%100 Doğrulanabilir (Çalıştırılabilir Görev)** |
| **İşlem Süresi** | 10 - 25 saniye | <5 ms | **<35 ms (Önbellekli AST + mtime senkron)** |

---

## ⚠️ 4. Riskler, Kırılma Noktaları ve Azaltma Stratejileri (Risk & Mitigation Matrix)

```mermaid
flowchart LR
    R1["1. Monorepo Dairesel Bağımlılık"] --> M1["Ports & Adapters (Tersine Çevirme)"]
    R2["2. Yığın İzi Format Sapması"] --> M2["Polyglot Heuristic & Fallback"]
    R3["3. Senkron AST Gecikmesi"] --> M3["L1/L2 Önbellek & 50ms SLA"]
    R4["4. Sahte Pozitif Hipotez"] --> M4["Falsifiye Edici Mikro-Kanıt Testi"]
    R5["5. Demir Kafes Kota Kilitlenmesi"] --> M5["Decomposition-First Reçete"]
    R6["6. Eşzamanlı Worktree Çakışması"] --> M6["WorktreeMutex Kalkanı & Sıra"]
```

| # | Teşhis Edilen Risk | Olasılık | Etki | Mühendislik Çözümü & Azaltma Stratejisi |
| :-: | :--- | :-: | :-: | :--- |
| **R1** | **Dairesel Paket Bağımlılığı:** `dialogue-engine`'in çekirdek paketlere doğrudan bağlanıp çevrimsel bağımlılık yaratması. | Orta | Yüksek | **Ports & Adapters (Hexagonal Mimari):** Paket içinde yalnızca arayüzler (`IEvidenceProvider`, `IMemorySliceResolver`) tanımlanır. Somut sınıflar CLI bootstrap katmanında enjekte edilir. |
| **R2** | **Yığın İzi Format Kırılganlığı:** Node.js, Godot `res://`, Vitest veya Python stack formatlarının ayrıştırılamaması. | Yüksek | Orta | **Çoklu Strateji Ayrıştırıcı & Güven Eşiği:** Çoklu regex stratejisi uygulanır. Güven skoru <%80 ise AST sembol aramasına ve 1-turluk kullanıcı onayına geçilir (Graceful Fallback). |
| **R3** | **AST Sorgu Gecikmesi:** Büyük depolarda AST ve çağıran ağacının taranmasının CLI yanıtını yavaşlatması (>500ms). | Düşük | Yüksek | **Katmanlı Önbellek & Sınırlandırılmış Derinlik:** `.aegis/memory/` disk ve L1 RAM önbelleği kullanılır. İlişkisel derinlik 1 ile sınırlandırılır. 50ms aşımında özet veri döndürülür. |
| **R4** | **Yanıltıcı Hipotez ve Model Önyargısı:** Hipotezlerin yetersiz kanıta dayanıp yanlış tamir planı üretmesi. | Orta | Yüksek | **Yanlışlanabilir Hipotezler & Mikro-Test:** Hipotezler izole test komutuyla ilişkilendirilir. Tur 2'de reçete yazılmadan önce tek bir mikro-test çalıştırılarak kök neden kanıtlanır. |
| **R5** | **Demir Kafes Bütçe Kilitlenmesi:** Hatalı dosyanın zaten 290+ satırda olması durumunda yamanın derleme hatası vermesi. | Orta | Kritik | **Önce-Ayrıştır-Sonra-Onar (Decomposition-First):** `LineBudgetRadar` bütçeyi <15 satır görürse reçete doğrudan fonksiyonu kardeş modüle taşıyıp ardından onarma moduna geçer. |
| **R6** | **Çoklu Ajan Worktree Çakışması:** Aynı dosyanın başka bir ajan (`solver`/`qa`) tarafından kilitli olması. | Düşük | Yüksek | **WorktreeMutex Ön Denetimi:** `.aegis/locks.json` taranır; dosya kilitliyse kullanıcı uyarılır ve reçete izole bir scratch çalışma alanına atanır. |

---

## 🔒 5. Demir Kafes ve Mimari Standartlar

1. **Katı Dosya ve Fonksiyon Sınırları:**
   - Yeni eklenecek/refactor edilecek hiçbir dosya 300 satırı aşamaz.
   - Hiçbir fonksiyon 40 satırı aşamaz.
2. **Mimari Yön Kuralı (Dependency Inversion):**
   - `@aegis/dialogue-engine`, alt çekirdek paketlere (`ast-skeleton`, `watchdog`, `iron-cage`) doğrudan sıkı bağlılık kurmak yerine arayüzler (`EvidenceProvider`, `MemoryQueryService`) üzerinden bağlanacaktır.
3. **Mutasyon Testi Zorunluluğu:**
   - Ayrıştırıcı, durum makinesi ve reçete oluşturucunun mutasyon skoru en az %70 (hedef %100) olacaktır.
4. **Sıfır `any` ve Tip Bütünlüğü:**
   - Tüm teşhis nesneleri, hipotez modelleri ve kanıt türleri TypeScript strict tipleriyle mühürlenecektir.

---

## 🎯 6. Kabul Kriterleri ve Atomik Görev Planı (Acceptance Criteria & GitHub Issues)

- [ ] **Task 1 ([#231](https://github.com/frkntlr/aegis/issues/231)):** `feat(dialogue-engine): implement hexagonal ports and adapters for evidence, memory, and line budget` (R1 Kalkanı).
- [ ] **Task 2 ([#232](https://github.com/frkntlr/aegis/issues/232)):** `feat(dialogue-engine): implement PolyglotStackTraceParser with multi-format heuristics and confidence scoring` (R2 Kalkanı).
- [ ] **Task 3 ([#233](https://github.com/frkntlr/aegis/issues/233)):** `feat(dialogue-engine): implement AstTriangulator and dynamic falsifiable hypothesis generation` (R3 & R4 Kalkanı).
- [ ] **Task 4 ([#234](https://github.com/frkntlr/aegis/issues/234)):** `feat(dialogue-engine): implement ArmoredPrescriptionBuilder with decomposition-first line budgeting and mutex shield` (R5 & R6 Kalkanı).
- [ ] **Task 5 ([#235](https://github.com/frkntlr/aegis/issues/235)):** `feat(cli): integrate Socratic diagnostic engine with aegis debug command and concrete monorepo adapters` (CLI Entegrasyonu).
- [ ] **Task 6 ([#236](https://github.com/frkntlr/aegis/issues/236)):** `test(dialogue-engine): comprehensive mutation testing gate and Demir Kafes compliance audit` (Kalite Mührü).
