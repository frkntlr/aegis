# 🛡️ AEGIS — Autonomous Vibe Coding Engine
### Antigravity IDE & Web Optimize Otonom Yazılım Mühendisliği ve Güvenlik Motoru

[![CI](https://github.com/aegis-engine/aegis/actions/workflows/ci.yml/badge.svg)](https://github.com/aegis-engine/aegis/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: 24](https://img.shields.io/badge/node->=20-blue.svg)](https://nodejs.org/)

Aegis, yapay zekanın dikkatinin dağılması (**context bloat**), bağlam unutması (**context drop**), halüsinasyon, spagetti/ölü kod üretimi ve sonsuz kilitlenme (**stall**) sorunlarını ortadan kaldıran; **Git Worktree altyapısı**, **Cerrahi AST İskeletleme**, **3 Fazlı Adaptif Akıllı Timeout**, **Deterministik Demir Kafes**, **Immutable Oracle** ve **Web Komuta Merkezi** ile donatılmış yeni nesil açık kaynak otonom kodlama motorudur.

---

## 🌟 Temel Özellikler

- 🗺️ **Cerrahi Bağlam & AST İskeletleme (%73-95 Token Tasarrufu):** Fonksiyon gövdelerini gizleyip sadece tip, arayüz ve metod imzalarını sunarak token israfını ve model halüsinasyonlarını sıfırlar.
- 🧠 **3 Fazlı Adaptif Akıllı Timeout:** Sabit 15-45s yerine, değişiklik yarıçapı, test adedi ve tarihsel ortalamaları analiz ederek dinamik süre hesaplar; çıktı akarken süreyi uzatır, 60s sessizlikte anında donma (*stagnation*) tespiti yapar.
- 🛡️ **Deterministik Demir Kafes (0 Token Maliyetli Bekçi):** Fonksiyonların 40 satırı, dosyaların 300 satırı aşmasını ve full-file rewrite girişimlerini fiziksel olarak engeller.
- 🤖 **İzole Git Worktrees (Alice & Bob):** Ajanlar `experimental/alice` ve `experimental/bob` alanlarında bağımsız çalışır. `master` dalı doğrudan koruma altındadır.
- 🔒 **Conflict-Free File Locking:** İki ajanın aynı dosyalarda çakışmasını engelleyen otonom kilit mekanizması.
- 🔍 **Ayrıştırılmış Doğrulama (Immutable Oracle):** Ajanın test dosyalarını tahrif etmesini engeller, vacuous testleri (`expect(x).toBe(x)`) anında reddeder.
- 📐 **Sıfır-Token Telemetri UI/UX Inspector:** Video izletip token yakmak yerine, BoundingBox koordinatlarıyla çakışma ve taşmaları 0 token harcayarak yakalar.
- 🧪 **Mutation Testing Gate:** Koddaki yapay mutasyonları testlerin yakalama oranını (%70 barajı) ölçer.
- 🌐 **Web Komuta Merkezi (Dashboard):** Token termometresi, canlı 4 kalite kalkanı ve GitHub Projects Kanban panosu.

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
Tarayıcınızda `http://localhost:3000` adresine giderek canlı göstergeleri izleyebilirsiniz.

---

## 💻 CLI Komut Referansı

| Komut | Açıklama |
|-------|----------|
| `aegis init` | Worktree alanlarını ve ajan anayasasını hazırlar |
| `aegis status` | Aktif worktree'leri ve dosya kilitlerini listeler |
| `aegis auto` | Otonom görev dağıtım kuyruğunu tetikler (`/auto`) |
| `aegis dashboard [port]` | Komuta merkezi web panelini başlatır |
| `aegis estimate <files> <tests>` | Adaptif dinamik süre tahmini yapar |
| `aegis verify <file>` | Dosyayı Demir Kafes kurallarına göre doğrular |
| `aegis skeleton <file>` | AST İskelet Haritası ve token tasarrufunu çıkarır |
| `aegis diff <diff>` | Cerrahi Unified Diff formatını doğrular |
| `aegis audit <files>` | Immutable Oracle güven denetimini koşturur |
| `aegis inspect` | Sıfır-token BoundingBox UI düzen denetimi yapar |
| `aegis mutate [file]` | Mutation Testing skoru değerlendirmesi yapar |

---

## 🏛️ Monorepo Mimarisi

```
aegis/
├── packages/
│   ├── core/
│   │   ├── ast-skeleton/        # Cerrahi Bağlam & AST İskeletleme
│   │   ├── compound-checker/    # Kaskad Hata & Regresyon Önleyici
│   │   ├── github-live/         # Canlı GitHub & Yaşayan Wiki Hafıza
│   │   ├── iron-cage/           # Deterministik Demir Kafes
│   │   ├── mcp-security/        # MCP Güvenlik & RBAC Katmanı
│   │   ├── orchestrator/        # Git Worktree & 4 Adımlı Merge Pipeline
│   │   ├── trust-verifier/      # Ayrıştırılmış Doğrulama & Immutable Oracle
│   │   └── watchdog/            # 3 Fazlı Adaptif Akıllı Timeout Motoru
│   ├── plugins/
│   │   └── telemetry-tester/    # Sıfır-Token UI Inspector & Mutation Gate
│   ├── web-dashboard/           # Komuta Merkezi Web Paneli & SSE Server
│   ├── shared/                  # Ortak Tipler ve Arayüzler
│   └── cli/                     # aegis Komut Satırı Aracı
├── docker/                      # Hardened Container Sandbox Ortamları
├── docs/                        # Ajan Anayasası & Güvenlik Modeli
└── .github/toolchain.json       # Otonom Geliştirme Manifestosu
```

---

## 📜 Lisans

Bu proje [MIT Lisansı](LICENSE) altında açık kaynak olarak dağıtılmaktadır.
