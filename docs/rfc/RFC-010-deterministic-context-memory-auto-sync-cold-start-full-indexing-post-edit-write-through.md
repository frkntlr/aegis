# 🏛️ RFC-010: Deterministic Context Memory Auto-Sync (Cold-Start Full Indexing & Post-Edit Write-Through)
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-010 | **Durum:** Approved (Onaylandı) ✅ | **Tarih:** 2026-10-25 | **Yazar:** Aegis Autonomous Engine
- **GitHub Discussion:** [#219 (Ideas)](https://github.com/frkntlr/aegis/discussions/219)

---

## 🔍 1. Fikir ve Problem Tanımı

Aegis'in 5-Katmanlı Kod Hafızası (`CodebaseMemoryEngine`), dil modellerine ve otonom ajanlara cerrahi dilimler (`SymbolSliceExtractor`), ilişkisel çağrı ağacı (`RelationalGraph`), Context7 dokümantasyonu ve Demir Kafes bütçelemesi sunan merkezi sinir sistemidir.

### ⚠️ Mevcut Kullanım ve Darboğazlar (Bottlenecks):
1. **Tembel (Lazy) Cold-Start Sınırlılığı:** Hafıza başlangıçta proaktif olarak tüm projeyi taramaz. Yalnızca `memory:query` ilk kez çağrıldığında ve eğer bellek boşsa (`totalFiles === 0`) `packages` dizini taranır. Projenin kök dizinindeki diğer kaynaklar (`src`, `scripts`, `.agents`, `addons` vb.) dışarıda kalır.
2. **Pasif Değişiklik Yakalama (Missing Write-Through Hook):** Değiştirilen dosyaların hafızaya yansıması iki şarta bağlıdır:
   - Ya bir terminalde arka planda `aegis memory:watch` (`fs.watch`) çalışıyor olmalıdır (manuel süreç).
   - Ya da birisi sonradan tekrar `queryMemory` çağıracak ve `LiveHotPatcher` git durumundan dosyayı fark edecektir.
   Eğer bir ajan veya araç kod yazıp bitirirse ve hafıza tekrar sorgulanmazsa, `.aegis/memory/*.json` disk önbelleği bayat kalır.
3. **Kapsam Daralması:** `packages` dizini önceliklendirildiğinden monorepo dışı veya kök dizin projelerinde otomatik kapsama oranı düşmektedir.

---

## 🏗️ 2. Hedeflenen Mimari ve Çözüm Tasarımı

### A. Proaktif Cold-Start Tam Proje İndeksleyicisi (`ColdStartInitializer`)
- Aegis bir projede ilk kez başlatıldığında (`aegis status`, `aegis auto`, dashboard ayağa kalktığında veya ilk task dispatch edildiğinde):
- `.aegis/memory/<worktree>.json` disk önbelleği yoksa veya `totalFiles === 0` ise otomatik olarak **tüm proje kökünü (`.`)** baştan sona tarar.
- `node_modules`, `.git`, `dist`, `.aegis`, `build` gibi kara listedeki dizinler otomatik dışlanır.
- Desteklenen tüm uzantılar (`.ts`, `.tsx`, `.gd`, `.py`, `.rs`, `.go`, `.cpp`, `.tscn`, `.tres`) AST indeksine ve ilişkisel çizgeye kaydedilir.

### B. Olay Güdümlü Kesin Write-Through Kancası (`Post-Mutation Indexing Hook`)
- Herhangi bir ajan veya araç dosya değiştirdiğinde (`write_file`, `edit_file`, AST replace, patch veya `git commit`):
- `CodebaseMemoryEngine.indexFile(filePath, newContent)` anında (senkron veya microtask queue ile) tetiklenir.
- `MemoryDiskStore.save()` ile `.aegis/memory/<worktree>.json` dosyası atomik olarak güncellenir.
- "Watcher açık mıydı?" veya "Sonradan sorgu yapıldı mı?" bağımlılığı tamamen ortadan kalkar; bellek daima %100 güncel ve deterministiktir.

### C. Git Pre-Commit / Post-Commit Entegrasyonu
- Pre-commit ve merge pipeline adımlarında `LiveHotPatcher.patchUncommitted` otomatik çalıştırılarak commit edilen tüm dosyaların hafıza çizgesinde yer aldığı garanti altına alınır.

---

## 💬 3. Tartışılan Açık Sorular ve Kesin Mimari Kararlar (Resolved Decisions)

Discussion #219 altında yürütülen müzakere sonucunda aşağıdaki mimari kararlar kesinleştirilmiştir:

### A. Performans, Bellek Tüketimi ve Token Dengesi (3-Tier Model)
- **Tier 1 (RAM / Micro-Cache):** Aktif dosyalar için `LruFileBuffer` (kapasite: 100 dosya, RAM <50MB).
- **Tier 2 (Disk FastSync Index):** `.aegis/memory/<worktree>.json` dosyasında tam metinler yerine yalnızca sembol AST'si ve parmak izi saklanır (disk boyutu 3-5MB tavanı).
- **Tier 3 (Ground-Truth On-Demand):** Context7 dokümantasyonu ve loglar yalnızca sorgu anında dinamik okunur ve RTK Token Killer ile sıkıştırılır.
- **Token Tasarrufu:** `SymbolSliceExtractor` ham dosya yerine yalnızca hedeflenen sembolün 1-derinlik dilimini sunarak %85-%95 token tasarrufu sağlar.

### B. Geriye Dönük Uyumluluk ve Çoklu Worktree Senkronizasyonu
- **İzole Ad Alanı:** `ActiveHeadResolver` ile her worktree (`solver`, `qa`, `docs`) izole CoW disk hafızasında yaşar; ajanlar arası çizge kirliliği sıfırdır.
- **Bellek Füzyonu (`MemoryFusionSync`):** 4-aşamalı atomik merge hattında (`AgentMergeWorkflow`), birleştirilen dosya sembolleri otomatik olarak `master.json` ve kardeş worktree hafızalarına aktarılır.
- **Şema Göçü:** Eski sürüm önbellekler açılışta taranarak yeni alanlar varsayılanlarla doldurulur; önbellek sıfırlanmadan yumuşak göç sağlanır.

### C. Alternatif Yaklaşımlar: Neden Vektör/RAG Değil, 5-Katmanlı Motor?
- Vektör tabanlı anlamsal benzerlik arama yöntemleri derleyici kesinliği sağlayamaz, halüsinasyona (uydurma fonksiyon/import) açıktır ve ağır Python/Torch bağımlılıkları gerektirir.
- Aegis 5-Katmanlı Motor (AST İskeleti, İlişkisel Çizge, Context7, Demir Kafes, Worktree Mutex) sıfır harici bağımlılıkla milisaniyeler seviyesinde kesinlik, proaktif satır kotası denetimi ve determinizm sunar.

---

## 📊 4. Mevcut vs Hedeflenen Mantık Kıyaslama Matrisi

| Kabiliyet | Mevcut Durum (Nasıl Yapıyor?) | Hedeflenen Mantık (Ne İstiyoruz?) | Uyum & Karar |
| :--- | :--- | :--- | :---: |
| **İlk Kez Çalışma (Cold-Start)** | Yalnızca `memory:query` anında tembel tetiklenir; varsayılan olarak sadece `packages/` taranır. | Aegis ayağa kalktığı an tüm proje kökünü (`.`) arka planda eksiksiz tarayan proaktif cold-start. | **Geliştirilecek (%40 -> %100)** |
| **Dosya Değişikliği İndeksleme** | `memory:watch` çalışıyorsa 150ms sonra; kapalıysa yalnızca sonraki `queryMemory` anında git mtime kontrolüyle. | **Zorunlu Write-Through**: Dosya yazıldığı / düzenlendiği an doğrudan `indexFile` kancası çalışır. | **Geliştirilecek (%50 -> %100)** |
| **İzole Worktree Ayrımı** | `ActiveHeadResolver` ile her worktree (`solver`, `qa`, `docs`) izole ad alanına ve `.aegis/memory/<wt>.json` dosyasına sahiptir. | Mevcut güçlü worktree izolasyonu ve Copy-on-Write yapısı korunur. | **Mevcut (%100 Uyumlu)** |
| **Hızlı Senkronizasyon (FastSync)** | `GitFastSyncEngine` (mtime + boyut + HEAD SHA kontrolü) ile değişmeyen dosyalar 0ms'de atlanır. | FastSync altyapısı korunarak gereksiz disk I/O ve AST re-parse engellenir. | **Mevcut (%100 Uyumlu)** |
| **Silinen Dosyaların Tahliyesi** | `pruneDeletedFiles` veya git porcelain delete ile periyodik temizlenir. | Dosya silme operasyonunda anında `removeFile` tetiklenir. | **Mevcut (%90 Uyumlu)** |
| **IDE / MCP Otomasyonu** | MCP araçları üzerinden `memory_query` ve `memory_stats` sorgulanabilir, otomatik kaydetme hook'u yoktur. | Ajan dosya yazma araçlarına (`write_file`/`edit_file`) bellek hook'u enjekte edilir. | **Geliştirilecek (%30 -> %100)** |

---

## ⚠️ 5. Riskler & Etki Alanı Analizi (Blast Radius & Mitigation Strategies)

Canlı Aegis hafıza telemetrisi (`memory:query`, `memory:stats`, `trace`) üzerinden yürütülen tanı araştırmasında aşağıdaki riskler tespit edilmiştir:

1. **Demir Kafes Satır Kotası Riski (`codebase-memory.ts`):**
   - `codebase-memory.ts` şu anda 298/300 satırdadır (kalan kota: 2 satır).
   - *Çözüm:* Cold-start ve write-through mantığı bağımsız modüllere (`ColdStartIndexer`, `MemoryWriteThroughHook`) çıkarılmalı, ana motor yalnızca 1 satırlık delege çağrısı yapmalıdır.
2. **Cold-Start Latency & Event Loop Blokajı:**
   - Binlerce dosyalık depolarda senkron `fs.readdirSync` CLI başlangıç hedefini (100ms) aşabilir.
   - *Çözüm:* `GitFastSyncEngine` mtime + dosya boyutu kontrolüyle önbellek eşleşmeleri 0ms'de geçilmeli, asenkron chunked event loop kullanılmalıdır.
3. **Disk I/O ve Windows `EBUSY` Çakışması:**
   - Çoklu peş peşe yazmalarda tüm JSON hafızasının diske yazılması I/O yükü oluşturur.
   - *Çözüm:* RAM bellek güncellemesi anlık (senkron, 0ms), disk önbelleğe yazma (`MemoryDiskStore.save`) ise 100ms debounced ve atomik (`tmp -> rename`) olmalıdır.
4. **Çoklu Worktree Sibling Senkronizasyonu:**
   - Worktree merge (`aegis merge solver master`) sonrasında kardeş worktree hafızalarının bayat kalmaması için `AgentMergeWorkflow` otomatik hafıza senkronizasyonu adımı içermelidir.
5. **Hayalet Semboller (Ghost Symbols):**
   - Silinen dosyaların çizgeden temizlenmesi için write-through kancası dosya silme operasyonlarında `removeFile` tetiklemelidir.

---

## 🔒 6. Demir Kafes ve Mimari Standartlar
- Maksimum 300 satır/dosya, maksimum 40 satır/fonksiyon.
- Non-blocking asenkron tam tarama (arka plan worker veya chunked event loop).
- Sadece cerrahi unified diff ve 0 false-alarm garantisi.

---

## 🎯 7. Kabul Kriterleri (Acceptance Criteria)
- [ ] `CodebaseMemoryEngine.ensureColdStartIndexed(repoRoot)` metodu eklendi; bellek boşsa tüm proje ağacını proaktif indeksliyor.
- [ ] `CodebaseMemoryEngine.notifyFileChanged(filePath, content)` write-through hook'u tanımlandı.
- [ ] CLI, Auto Runner ve Task Dispatcher başlangıcında cold-start tetikleniyor.
- [ ] Dosya düzenleme ve git kancalarında post-edit auto-sync garantilendi.
- [ ] Tüm birim testler (%100 pass) ve mutasyon testleri (%100 kill score) başarıyla tamamlandı.
