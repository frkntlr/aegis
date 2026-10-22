# 🛡️ AEGIS — Autonomous Vibe Coding Engine
### Antigravity IDE, Mulgravity & Web Optimize Otonom Yazılım Mühendisliği ve Güvenlik Motoru

[![CI](https://github.com/aegis-engine/aegis/actions/workflows/ci.yml/badge.svg)](https://github.com/aegis-engine/aegis/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: 24](https://img.shields.io/badge/node->=20-blue.svg)](https://nodejs.org/)

Aegis, yapay zekanın dikkatinin dağılması (**context bloat**), bağlam unutması (**context drop**), halüsinasyon, spagetti/ölü kod üretimi ve sonsuz kilitlenme (**stall**) sorunlarını ortadan kaldıran; **Git Worktree altyapısı**, **Cerrahi AST İskeletleme**, **3 Fazlı Adaptif Akıllı Timeout**, **Deterministik Demir Kafes**, **Immutable Oracle**, **Çoklu IDE / Mulgravity Entegrasyonu**, **Açık Kaynak Topluluk Döngüsü (RFC Triager)** ve **Gerçek Zamanlı SSE Web Komuta Merkezi** ile donatılmış yeni nesil açık kaynak otonom kodlama motorudur.

---

## 🌟 Temel Özellikler

- 🗺️ **Cerrahi Bağlam & Çok Dilli AST İskeletleme (%67-95 Token Tasarrufu):** TypeScript, JavaScript, GDScript ve Rust desteği. Fonksiyon gövdelerini gizleyip sadece tip, arayüz ve metod imzalarını sunarak token israfını ve model halüsinasyonlarını sıfırlar.
- 👥 **Mulgravity & Çoklu IDE Oturum Tespiti:** Google Antigravity (paralel Mulgravity pencereleri), Cursor AI ve VS Code oturumlarını `.vscode` / `.cursor` yapılandırma imzaları ve `.aegis/sessions/` heartbeat telemetrisiyle anlık olarak tespit eder.
- 🧠 **3 Fazlı Adaptif Akıllı Timeout:** Sabit 15-45s yerine, değişiklik yarıçapı, test adedi ve tarihsel ortalamaları analiz ederek dinamik süre hesaplar; çıktı akarken süreyi uzatır, 60s sessizlikte anında donma (*stagnation*) tespiti yapar.
- 🛡️ **Deterministik Demir Kafes (0 Token Maliyetli Bekçi):** Fonksiyonların 40 satırı, dosyaların 300 satırı aşmasını ve full-file rewrite girişimlerini fiziksel olarak engeller.
- 🤖 **İzole Git Worktrees & Görev Kuyruğu:** Ajanlar (`experimental/alice`, `experimental/bob`, `experimental/contributor`) izole worktree'lerde bağımsız çalışır. `master` ve `main` dalları doğrudan koruma altındadır.
- 🔒 **Conflict-Free File Locking:** İki ajanın aynı dosyalarda çakışmasını engelleyen otonom kilit mekanizması ve canlı arayüzden kilit serbest bırakma desteği.
- 🔍 **Ayrıştırılmış Doğrulama (Immutable Oracle):** Ajanın test dosyalarını tahrif etmesini engeller, vacuous testleri (`expect(x).toBe(x)`) anında reddeder.
- 📐 **Sıfır-Token Telemetri UI/UX Inspector:** Video izletip token yakmak yerine, BoundingBox koordinatlarıyla çakışma ve taşmaları 0 token harcayarak yakalar.
- 🧪 **Mutation Testing Gate:** Koddaki yapay mutasyonları testlerin yakalama oranını (%70 barajı) ölçer.
- 📡 **Canlı SSE Web Komuta Merkezi (`localhost:3000`):** Server-Sent Events (`/api/events`) üzerinden 0 gecikmeli telemetri akışı, bağlı ajan kartları, kilitli dosyalar ve tek tıkla otonom görev tetikleme (`auto`, `sync`, `release_locks`).
- 🌐 **Kendi Kendini Besleyen Açık Kaynak Topluluk Döngüsü:** GitHub Discussions üzerinden gelen RFC önerilerini (`RfcTriager`) otomatik kabul kriterlerine ve GitHub Issue'larına dönüştürür.
- 📚 **NotebookLM Kolektif Bilgi Köprüsü:** Mimari notları ve topluluk RFC analizlerini `.aegis/research/` altında toplar; `aegis nlm:sync` ile NotebookLM araştırma oturumlarına aktarır.

---

## 🚀 Hızlı Başlangıç

### 1. Kurulum & Bağımlılıklar
```bash
git clone https://github.com/aegis-engine/aegis.git
cd aegis
npm install
npm run build
```

### 2. Ortamı Başlatma (Init)
```bash
node packages/cli/dist/bin/aegis.js init
```
Alice ve Bob için izole `experimental/alice` ve `experimental/bob` worktree dizinleri anında hazırlanır.

### 3. Komuta Merkezini Başlatma (Web Dashboard)
```bash
node packages/cli/dist/bin/aegis.js dashboard 3000
```
Tarayıcınızda `http://localhost:3000` adresine giderek canlı Mulgravity oturumlarını, dosya kilitlerini ve SSE telemetrisini izleyebilirsiniz.

---

## 💻 CLI Komut Referansı

| Komut | Açıklama |
|-------|----------|
| `aegis init` | Worktree alanlarını ve ajan anayasasını hazırlar |
| `aegis status` | Aktif worktree'leri, bağlı IDE oturumlarını ve dosya kilitlerini listeler |
| `aegis auto` | Otonom görev dağıtım kuyruğunu tetikler (`/auto`) |
| `aegis dashboard [port]` | Komuta merkezi web panelini ve SSE akışını başlatır |
| `aegis contribute <issueId>` | Dış katkıcı / AI için izole worktree ve cerrahi prompt hazırlar |
| `aegis rfc:triage "<title>"` | GitHub Discussions RFC başlığını parse edip kabul kriterlerine dönüştürür |
| `aegis nlm:sync` | Aegis mimarisini ve RFC araştırmalarını NotebookLM bilgi paketine aktarır |
| `aegis cage:check` | Tüm projeyi Demir Kafes (40 satır/fonksiyon, 300 satır/dosya) için denetler |
| `aegis skeleton:scan` | Tüm çalışma alanını tarayıp AST token tasarrufunu hesaplar |
| `aegis estimate <files> <tests>` | Adaptif dinamik süre tahmini yapar |
| `aegis verify <file>` | Dosyayı Demir Kafes kurallarına göre doğrular |
| `aegis skeleton <file>` | AST İskelet Haritası ve token tasarrufunu çıkarır |
| `aegis diff <diff>` | Cerrahi Unified Diff formatını doğrular |
| `aegis audit <files>` | Immutable Oracle güven denetimini koşturur |
| `aegis inspect` | Sıfır-token BoundingBox UI düzen denetimi yapar |
| `aegis mutate [file]` | Mutation Testing skoru değerlendirmesi yapar |
| `aegis gh:status` | Canlı GitHub Issues durumunu ve kilitlerini raporlar |
| `aegis gh:sync` | GitHub Issues ve Discussions verilerini yerel önbellekle senkronize eder |

---

## 👥 Mulgravity & Çoklu IDE İş Akışı

Aegis, geliştiricilerin veya bağımsız çalışan yapay zeka ajanlarının farklı pencerelerde (Google Antigravity Mulgravity, Cursor, VS Code) aynı anda çalışmasını destekler:

1. **Pasif Oturum Tespiti:** Bir worktree dizini (`worktrees/alice`, `worktrees/bob`) Antigravity veya Cursor ile açıldığında, IDE imza dosyaları otomatik olarak tespit edilir.
2. **Heartbeat & Dosya Kilitleri:** Ajan çalışırken dosya kilitleri edinir. Kilitli dosyalara başka bir oturum dokunamaz.
3. **Web Paneli Entegrasyonu:** `http://localhost:3000` üzerinden hangi ajanın hangi IDE ile bağlı olduğu, CPU/Bellek kullanımı ve üzerinde çalıştığı dosyalar gerçek zamanlı izlenir.

---

## 🏛️ Monorepo Mimarisi

```
aegis/
├── packages/
│   ├── core/
│   │   ├── ast-skeleton/        # Cerrahi Bağlam, Çok Dilli (TS/GDScript/Rust) AST İskeletleme
│   │   ├── compound-checker/    # Kaskad Hata & Regresyon Önleyici
│   │   ├── github-live/         # Canlı GitHub, RFC Triager & NotebookLM Bridge
│   │   ├── iron-cage/           # Deterministik Demir Kafes
│   │   ├── mcp-security/        # MCP Güvenlik & RBAC Katmanı
│   │   ├── orchestrator/        # Git Worktree, IDE Adapters & 4 Adımlı Merge Pipeline
│   │   ├── trust-verifier/      # Ayrıştırılmış Doğrulama & Immutable Oracle
│   │   └── watchdog/            # 3 Fazlı Adaptif Akıllı Timeout Motoru
│   ├── plugins/
│   │   └── telemetry-tester/    # Sıfır-Token UI Inspector & Mutation Gate
│   ├── web-dashboard/           # Canlı SSE Komuta Merkezi & Oturum Algılayıcı
│   ├── shared/                  # Ortak Tipler ve Arayüzler
│   └── cli/                     # aegis Komut Satırı Aracı
├── docker/                      # Hardened Container Sandbox Ortamları
├── docs/                        # Ajan Anayasası & Güvenlik Modeli
└── .github/                     # CI/CD, PR Shield & RFC Discussion Şablonları
```

---

## 📜 Lisans

Bu proje [MIT Lisansı](LICENSE) altında açık kaynak olarak dağıtılmaktadır.
