# 🏛️ RFC-009: Deep Logic Defects Remediation & Autonomous Execution Hardening Engine
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-009 | **Durum:** Implemented (Tamamlandı) | **Tarih:** 2026-10-25
- **Tartışma:** [Discussion #65](https://github.com/frkntlr/aegis/discussions/65) | **Çözülen Issue:** [#66](https://github.com/frkntlr/aegis/issues/66) | **Commit:** `69f37e6`

---

## 🔍 1. Fikir ve Problem Tanımı
Aegis otonom mimarisinin derinliklerinde çalışan arka plan bileşenlerinde tespit edilen kritik mantık hataları, yarış durumları ve eksik entegrasyonlar çözümlenmiştir:
1. **Orphan Task False-Positive Hijacking:** `OrphanTaskReclaimer`, oturum listesi boş veya aktarılmamışken (`sessions = []`), headless CLI (`aegis auto`) modunda dosya kilidi tutan aktif ajanların görevlerini "ölü" kabul ederek zorla geri alıyordu.
2. **Offline Modda Yetim Görev Atlanması:** `core-commands.ts`, canlı GitHub bağlantısı olmadığında yerel `.aegis/issues.json` görevlerini yetim taramasından geçirmiyordu.
3. **Bağıl TypeScript ve Python Import Kopukluğu:** `CrossReferenceLinker`, `./helper.js` gibi bağıl import yollarını normalize etmediğinden hedef `src/helper.ts` dosya düğümüne bağlayamıyor ve gelen çağrı (caller) zincirini koparıyordu; Python import ve kalıtım çözümlemesi eksikti.
4. **Blast Radius Metot Kirliliği:** `GraphQueryEngine`, `Hero.take_damage` gibi metot çağrılarını nokta içerdiği için dosya sanarak `blastRadiusFiles` listesine ekliyordu.
5. **Dosya Yoluyla Sembol Arama:** `SymbolIndexer`, sembol adı yerine dosya yolu ile arama yapıldığında boş sonuç üretiyordu.
6. **Harici CLI Çökme Riski:** `AstGrepBridge`, ast-grep ikili dosyası bulunamadığında işlenmemiş süreç hatalarına (unhandled exception) açıktı.

---

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)

1. **`packages/core/watchdog/src/orphan-reclaimer.ts`**:
   - `sessions.length === 0` durumunda doğrudan öldü kabul etmek yerine `workspaceLocks.hasActiveLocks(targetFiles)` kontrolü eklendi.
   - Headless CLI yürütmeleri dosya kilidi aktif olduğu sürece korunarak görev çalınması önlendi.
2. **`packages/cli/src/commands/core-commands.ts`**:
   - `syncOrLoadAutoIssues` fonksiyonunda çevrimdışı yerel görev akışı için de `reclaimStaleTasks` çağrısı entegre edildi.
3. **`packages/core/ast-skeleton/src/cross-reference-linker.ts`**:
   - TypeScript bağıl importları `posix.normalize` ve `.js`/`.jsx` -> `.ts` eşlemesiyle çözümlendi.
   - Python AST çözümleyicisi (`class X(Y):`, `from ... import ...`) eklendi.
4. **`packages/core/ast-skeleton/src/graph-query-engine.ts`**:
   - `isFilePath` yardımcı fonksiyonu ile yalnızca geçerli dosya uzantıları ve dizin ayracı barındıran öğeler blast radius dosyası olarak kabul edildi.
5. **`packages/core/ast-skeleton/src/symbol-indexer.ts`**:
   - `findSymbolsByFilePath` mantığı entegre edildi; dosya yolu girildiğinde doğrudan o dosyanın sembolleri dilimlendi.
6. **`packages/core/ast-skeleton/src/ast-grep-bridge.ts`**:
   - CLI kontrolü ve yürütmesi savunmacı `try/catch` bloklarıyla sarılarak süreç kararlılığı sağlandı.

---

## 🔒 3. Demir Kafes ve Doğrulama Standartları
- **Demir Kafes:** Değiştirilen tüm dosyalar azami 300 satır ve azami 40 satır/fonksiyon kuralına %100 uyumludur.
- **Mutasyon Test Kapısı:** Değiştirilen 6 kaynak dosyanın tamamında üretilen mutantların %100'ü öldürülmüştür.
- **Birim Testleri:** Watchdog (29/29), AST Skeleton (63/63), CLI (43/43) olmak üzere monorepo genelinde 28/28 görev başarıyla geçmiştir.

---

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] OrphanTaskReclaimer headless CLI kilit koruması ve çevrimdışı kurtarma entegre edildi.
- [x] CrossReferenceLinker bağıl TS ve Python import/kalıtım graf bağlantıları tamamlandı.
- [x] GraphQueryEngine blast radius metot kirliliği (`isFilePath`) filtrelendi.
- [x] SymbolIndexer dosya yoluyla sembol dilimleme özelliği eklendi.
- [x] AstGrepBridge savunmacı hata yönetimi ile güçlendirildi.
- [x] Demir Kafes AST denetiminden sıfır hatayla geçti (216/216 dosya, %100 Clean).
- [x] Mutasyon Test Kapısından %100 Kill Score ile onay alındı.
- [x] İzole worktree (`experimental/solver`) üzerinde 4-Aşamalı Atomik Pipeline ile `master` dalına birleştirildi (Commit: `69f37e6`).
- [x] GitHub Issue #66 başarıyla kapatıldı.
