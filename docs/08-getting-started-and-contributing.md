# 🚀 08 — Hızlı Başlangıç, Paket Mimarisi ve Katkı Kuralları

> Bu rehber; Aegis motorunu yerel ortamınızda derlemeyi, monorepo paket mimarisini anlamayı ve 14 değişmez maddeden oluşan **Ajan Anayasası** kurallarına uyarak katkıda bulunmayı açıklar.

---

## 1. Hızlı Başlangıç (Quick Start)

### 1.1. Sistem Önkoşulları
- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`
- **Git:** `>= 2.30.0`
- **TypeScript:** `5.7+`
- **Turborepo:** Kurulu veya `npx turbo` ile otomatik çalıştırılabilir.

### 1.2. Depoyu Klonlama ve Derleme
```bash
# 1. Depoyu klonlayın
git clone https://github.com/frkntlr/aegis.git
cd aegis

# 2. Bağımlılıkları yükleyin
npm install

# 3. Turborepo pipeline ile tüm paketleri derleyin
npm run build

# 4. Ortamı ve worktree'leri hazırlayın
node packages/cli/dist/bin/aegis.js init
```

Derleme sonrasında `aegis` ve `aegist` komutları sistem genelinde kullanılabilir hale gelir.

---

## 2. Monorepo Paket Dağılımı (14 Paket)

Aegis; **Turborepo** ve **TypeScript Project References** (`composite: true`) tabanlı modern bir monorepo mimarisinde 14 bağımsız modüle ayrılmıştır:

```
aegis/
├── packages/
│   ├── core/
│   │   ├── ast-skeleton/        # 5-Katmanlı Hafıza, AST İskeletleme, Symbiotic Substrate 2.0
│   │   ├── compound-checker/    # Kaskad Hata & Bileşik Regresyon Önleyici
│   │   ├── github-live/         # GitHub API, Wiki Senkronizasyonu & NotebookLM Köprüsü
│   │   ├── iron-cage/           # Deterministik Demir Kafes (300/40) & Fast-Stat Radar
│   │   ├── mcp-security/        # Ajan Rolü Bazlı MCP RBAC & Rate Limiting
│   │   ├── orchestrator/        # Git Worktrees, Mutex Kilitleri & Atomik Merge
│   │   ├── trust-verifier/      # Immutable Oracle (Test Tahrif Koruması)
│   │   └── watchdog/            # Adaptif Timeout, Devre Kesici & RTK Token Killer
│   ├── plugins/
│   │   ├── godot-bridge/        # Godot 4 Köprüsü, ClassDB Oracle & Playtest
│   │   └── telemetry-tester/    # Sıfır-Token UI Inspector & Mutasyon Test Kapısı
│   ├── dialogue-engine/         # Sokratik Teşhis Motoru & Yığın İzi Ayrıştırıcı
│   ├── web-dashboard/           # SSE Tabanlı Canlı Komuta Merkezi (Port 3000)
│   ├── shared/                  # Ortak TypeScript Tipleri ve IDE Arayüzleri
│   └── cli/                     # Evrensel CLI (50+ Komut) & 19 Araçlı MCP Sunucusu
├── .githooks/                   # Pre-commit & Pre-push Deterministik Kancalar
├── docs/                        # Modüler Dokümantasyon ve RFC Arşivi
├── turbo.json                   # Turborepo Pipeline & Önbellek Yapılandırması
└── tsconfig.base.json           # Paylaşımlı TypeScript Yapılandırması
```

---

## 3. Ajan Anayasası (14 Temel Madde)

> [!CAUTION]
> Bu maddeler AI modellerine prompt olarak rica edilmez — Git Hook'lar, Linter'lar ve AST doğrulamaları aracılığıyla **deterministik fiziksel engel** olarak uygulanır.

| # | Madde | Uygulama Mekanizması | İhlal Sonucu |
| :---: | :--- | :--- | :--- |
| **1** | `main`/`master` dalına doğrudan commit yasaktır | Git Hook (`branch-guard`) | Commit reddedilir |
| **2** | Fonksiyon uzunluğu 40 satırı geçemez | AST / ESLint (`max-lines-per-function`) | Linter Gate durdurur |
| **3** | Dosya uzunluğu 300 satırı geçemez | AST / ESLint (`max-lines`) | Linter Gate durdurur |
| **4** | Cyclomatic Complexity > 10 olamaz | AST Karmaşıklık Analizi | Linter Gate durdurur |
| **5** | Ölü kod veya kullanılmayan export bırakılamaz | Dead Code Scanner | Commit engellenir |
| **6** | Tüm dosya baştan yazılamaz (Sadece Unified Diff) | Patch Guard | Diff reddedilir |
| **7** | Testi olmayan yeni kod commit edilemez | Pre-commit Test Koşucusu | Commit engellenir |
| **8** | Kabul kriterleri doğrulanmadan Merge yapılamaz | `aegis verify:task` kancası | Merge reddedilir |
| **9** | Adaptif timeout tahmini yapılmadan test koşulamaz | Pre-Execution Estimator | Süreç başlatılamaz |
| **10** | Aynı test hatası 2 kezden fazla tekrarlanamaz | Diff-Hash Loop Detector | Devre Kesici (Fren) |
| **11** | Test dosyaları ajan tarafından modifiye edilemez | Trust Verifier (Immutable Oracle) | Şüpheli bayrak + Red |
| **12** | Mutation testing skoru < %70 olamaz | Mutasyon Test Kapısı (`aegis mutate`) | Commit reddedilir |
| **13** | İzolasyon dışı host komutu çalıştırılamaz | Process Sandbox Guard | Komut engellenir |
| **14** | İzin listesi dışı MCP tool'u çağrılamaz | MCP Security RBAC Layer | Erişim reddedilir |

---

## 4. Katkı ve Geliştirme Kuralları

Projeye katkı sağlayan geliştirici ve yapay zeka ajanları aşağıdaki iş akışına uymalıdır:

### 4.1. Zorunlu Ajan Kimlik Rozetleri
Tüm commit, PR ve log mesajları ilgili ajan rolü rozetiyle başlamalıdır:
- `🛠️ [ISSUE SOLVER] AKTİF | İzole Çözücü ve Geliştirici`
- `🎯 [QA HUNTER] AKTİF | Teşhis, Oynanış ve Görsel UI Denetçisi`
- `🎨 [UI SPECIALIST] AKTİF | Arayüz, Tema ve Görsel Cilalama Uzmanı`
- `📚 [DOC ARCHITECT] AKTİF | GitHub Dokümantasyon ve Proje Mimarı`

### 4.2. Pre-Commit ve Pre-Push Kancaları
Commit atılmadan önce `.githooks/pre-commit` otomatik devreye girer:
1. **Adım 1:** Deterministik Demir Kafes AST Doğrulaması (`cage:check`).
2. **Adım 2:** Monorepo Birim Testleri (`npm test`).
3. **Adım 3:** Mutasyon Testi Kapısı (`aegis mutate`, %70 barajı).

### 4.3. Cerrahi Diff Disiplini
Modellerin bir dosyayı baştan sona yeniden yazması (*full-file rewrite*) yasaktır. Yalnızca hedeflenen satırları değiştiren cerrahi unified diff üretilmelidir.

---

## 5. İlgili Belgeler

- [`01-architecture-and-memory.md`](file:///C:/Users/Lenovo/AntigravityProfiles/client-a/.gemini/antigravity/scratch/aegis/docs/01-architecture-and-memory.md) — Çekirdek mimari.
- [`02-task-ingestion-and-teamwork.md`](file:///C:/Users/Lenovo/AntigravityProfiles/client-a/.gemini/antigravity/scratch/aegis/docs/02-task-ingestion-and-teamwork.md) — Git Worktree ve kilitler.
- [`03-universal-cli-reference.md`](file:///C:/Users/Lenovo/AntigravityProfiles/client-a/.gemini/antigravity/scratch/aegis/docs/03-universal-cli-reference.md) — Komut kataloğu.
- [agent-constitution.md](file:///C:/Users/Lenovo/AntigravityProfiles/client-a/.gemini/antigravity/scratch/aegis/docs/agent-constitution.md) — Orijinal Anayasa metni.
