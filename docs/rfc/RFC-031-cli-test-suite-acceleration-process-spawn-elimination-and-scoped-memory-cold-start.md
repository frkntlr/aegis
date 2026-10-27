# 🏛️ RFC-031: CLI Test Suite Acceleration: Process Spawn Elimination and Scoped Memory Cold-Start
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-031 | **Durum:** Approved (Onaylandı) ✅ | **Tarih:** 2026-10-27
- **Discussion:** https://github.com/frkntlr/aegis/discussions/307

## 🔍 1. Fikir ve Problem Tanımı
Aegis CLI test süiti (`packages/cli`) CI/CD ve yerel çalıştırmalarda 9.5 - 14 saniye sürmekte olup geliştirici döngüsünü (feedback loop) yavaşlatmaktaydı.

Yapılan profil analizinde 3 ana kök neden tespit edilmiştir:
1. `commands/memory-command.test.js` ve `commands/mcp-server-command.ts`: `stats.totalEdges === 0` koşulu nedeniyle her testte tüm monorepo çalışma alanındaki `packages/` dizinini (1,911 dosya, 9,833 sembol) soğuk taramaya (cold-start) tabi tutmakta ve test başına ~3 saniye kaybetmekteydi.
2. `cli.test.js`: Her test için `execSync('node aegis.js ...')` ile ayrı Node.js alt süreci başlatmakta; ayrıca `prompt` komutları yerel dosyalardan önce uzak GitHub API'sine (`listIssues('all')`) çıkarak ağ gecikmesine yol açmaktaydı.
3. `GitFastSyncEngine.getHeadCommit` ve `LiveHotPatcher`: Her bellek ve bağlam sorgusunda `git rev-parse HEAD` subprocess'ini önbelleksiz çalıştırmakta ve 1,911 dosya üzerinde senkron `fs.statSync` döngüsü koşturmaktaydı.

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)
1. **Scoped Memory Auto-Indexing Gate (`memory-command.ts`, `mcp-server-command.ts`):**
   - Otomatik indeksleme koşulu `if (stats.totalFiles === 0 && !isTest)` olarak daraltıldı (`totalEdges === 0` kaldırıldı).
   - Test ortamında (`NODE_ENV === 'test'` veya `AEGIS_TEST === '1'`) global `packages/` dizininin otomatik taranması engellendi.
   - Bellek durum izolasyonu için `resetSharedMemoryEngine()` ve `setSharedMemoryEngine()` API'ları sağlandı.
2. **Local-First Issue Resolution (`prompt-command.ts`):**
   - `resolveIssue` akışında yerel `.aegis/prompts/` veya yerel mock veriler uzak ağ çağrısından (`client.fetchIssue`) önce kontrol edildi.
   - Test ortamında `autoConnectLive: false` enforcing edilerek canlı ağ çağrısının testi bloklaması engellendi.
3. **In-Process CLI Test Harness (`cli.test.ts`):**
   - Komut yönlendirme ve çıktı biçimlendirme testleri süreç içi (in-process) olarak çalıştırıldı.
   - İkili yürütme (binary execution) sağlığı için 1 adet hafif `help` smoke testi korundu.
4. **Fast Git Head Commit Cache & Dirty Porcelain Walk (`git-fast-sync.ts`, `live-hot-patcher.ts`):**
   - `getHeadCommit` çağrıları için 1000ms bellek içi TTL önbelleği eklendi.
   - `LiveHotPatcher` içine 2000ms throttle ve `git status --porcelain` dirty file walk eklendi.

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon.
- Sıfır `any` türü, sıfır yorumsuz `catch`.
- Cerrahi unified diff.

## 📊 4. Performans ve Hızlanma Metrikleri (Benchmark Results)
- `cli.test.js` (Prompt Compilation): **6,800ms -> 414ms (%93.9 Hızlanma ⚡)**
- `memory-command.test.js` (Query & Lock): **2,869ms -> 308ms (%89.2 Hızlanma ⚡)**
- `commands/memory-command.test.js` Toplam: **12.4s -> 2.09s (%83.1 Hızlanma ⚡)**
- `cli.test.js` Toplam Süre: **9.78s -> 1.08s (%88.9 Hızlanma ⚡)**
- Toplam CLI Test Başarısı: **89/89 Yeşil (%100 Başarı) ✅**

## 🎯 5. Kabul Kriterleri (Acceptance Criteria)
- [x] Kök neden analizi tamamlandı ve GitHub Tartışması #307'ye raporlandı.
- [x] `memory-command.ts` ve `mcp-server-command.ts` içerisindeki gereksiz global cold-start taraması kaldırıldı ve test izolasyon API'ları eklendi.
- [x] `prompt-command.ts` içerisinde yerel öncelikli `resolveIssue` mantığı sağlandı.
- [x] `GitFastSyncEngine.getHeadCommit` için bellek içi TTL önbelleği eklendi.
- [x] `cli.test.ts` süreç içi hızlı test koşucusuyla hızlandırıldı.
- [x] Demir Kafes AST doğrulaması sağlandı (tüm dosyalar <300 satır, <40 satır/fonksiyon).
- [x] `@aegis/cli` test süiti süresi 11+ saniyeden < 2 saniyeye indirildi.
- [x] Değişiklikler ve performans sonuçları GitHub Tartışması #307'ye kaydedildi.
