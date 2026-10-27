# 🏛️ Aegis Mimarisi: 6 Katmanlı Otonom Motor

Aegis mimarisi, yapay zeka ajanlarının sözlü kurallarla disipline edilemeyeceği gerçeğinden yola çıkar. Sistemin kalbinde deterministik yerel denetleyiciler, canlı Git entegrasyonları ve sıfır-token maliyetli fiziksel engeller yer alır.

---

## 1. Katman: Cerrahi Bağlam & AST İskelet Motoru (`@aegis/ast-skeleton`)
- **TypeScript Compiler API (`ts.createSourceFile`) / Çok Dilli AST:** Kod dosyalarındaki fonksiyon gövdelerini (`{ ... }`) gizler.
- **50.000 satırlık devasa projeyi 500 satırlık temiz bir tip ve imza haritasına dönüştürür.**
- **Token Tasarrufu:** %73 - %95 oranında tasarruf sağlar.
- **Katmanlı Prompt Caching:** Anayasa ve AST haritası ilk turn'de önbelleğe alınarak dondurulur; ardışık istekler %90 indirimli okunur.

---

## 2. Katman: Deterministik Demir Kafes (`@aegis/iron-cage`)
- **AST Tabanlı Denetim:** TypeScript Compiler API ile gerçek AST ayrıştırması yapılır; çok satırlı imzalar, şablon dizgileri (`template literals`) ve iç içe callback'ler hatasız taranır.
- **Karmaşıklık Sınırı:** Fonksiyonlar maks. 40 satır, dosyalar maks. 300 satır, Cyclomatic Complexity maks. 10.
- **Ölü Kod Yasağı:** Yenilenen yapılarda eski çağrılmayan export veya CSS sınıfları linter seviyesinde reddedilir.
- **Pre-commit Kancası:** Test ve kabul kriterlerini karşılamayan hiçbir commit Git seviyesinde atılamaz.

---

## 3. Katman: 3 Fazlı Adaptif Akıllı Timeout (`@aegis/watchdog`)
- **Pre-Execution Estimator:** Değişen dosya sayısı, etkilenecek test adedi, bağımlılık derinliği ve modülün geçmiş çalışma ortalamasını analiz ederek dinamik timeout hesaplar.
- **Heartbeat Canlılık İzleyici:** Test çalışırken stdout/stderr çıktısı geldikçe deadline uzatılır; 60 saniye tam sessizlikte anında donma (*stagnation*) kararı verilir.
- **Smart Fallback:** Kör bir kill yerine, dar kapsamlı test denemesi, stack trace enjeksiyonu ve circuit breaker basamağı çalışır.

---

## 4. Katman: Canlı GitHub & Wiki Yaşayan Hafıza (`@aegis/github-live`)
- **Statik `.md` Dosyaları Terk Edildi:** Context drop ve stale state sorunlarını çözer.
- **3 Maddelik Yaşayan Wiki Özeti:** Her merge sonrası ilgili modülün Wiki sayfasına 3 maddelik teknik özet yazılır; yeni görev alan ajan sadece ilgili Wiki sayfasını okur.
- **Self-Spawning Sınırı:** Ajanların kontrolsüzce alt görev açıp kısır döngüye girmesi görev başına maks. 3 alt görev ile sınırlandırılmıştır.

---

## 5. Katman: Otonom Görev Dağıtıcı & Merge Pipeline (`@aegis/orchestrator`)
- **Conflict-Free File Locking:** Bir görevi üstlenen ajan değiştireceği dosyaları kilitler; kardeş ajan bu dosyalarla kesişen görevleri otomatik atlar.
- **4 Adımlı Atomik Merge:**
  1. Yerel Demir Kafes Doğrulaması
  2. Rebase (`git rebase master`)
  3. Master Merge (`git merge`)
  4. Sibling Reset (`git reset --hard master`)

---

## 6. Katman: Telemetri Test & Görsel Kalkan (`@aegis/telemetry-tester`)
- **BoundingBox UI Inspector:** Arayüz bileşenlerini BoundingBox (x, y, w, h) koordinatlarıyla matematiksel olarak denetler; çakışma ve taşmaları 0 görsel token harcayarak bulur.
- **Mutation Testing Gate:** Koddaki operatörleri yapay olarak mutasyona uğratıp testlerin bunu yakalama oranını (%70 barajı) ölçer. Git staging alanındaki değişen dosyalar dinamik olarak analiz edilir.

---

## 7. CLI Komutları, Yardımcı Scriptler ve Git Kancaları Eşleme Tablosu

| İşlem / Fonksiyon | Modern Aegis CLI Komutu | Legacy / Yardımcı Script | Git Kancası / Tetikleyici |
|---|---|---|---|
| **Demir Kafes Denetimi** | `aegis cage:check [dir]` / `npm run aegis -- cage:check` | `node scripts/validate-compliance.js` | `.githooks/pre-commit` (1/3) & `.githooks/pre-push` (1/2) |
| **Atomik 4-Adımlı Merge** | `aegis merge <agent> [branch]` / `npm run aegis -- merge` | `node scripts/iron-cage-merge.js` | Otonom Dispatcher & PR Onayı |
| **Mutasyon Testi Kapısı** | `aegis mutate [file]` / `npm run aegis -- mutate` | - | `.githooks/pre-commit` (3/3, dinamik staged dosyalar) |
| **Monorepo Birim Testleri**| `npm test` (`turbo run test`) | - | `.githooks/pre-commit` (2/3) & `.githooks/pre-push` (2/2) |
| **Tekil Dosya Doğrulama** | `aegis verify <file>` | - | CI `Iron Cage Verification` |
