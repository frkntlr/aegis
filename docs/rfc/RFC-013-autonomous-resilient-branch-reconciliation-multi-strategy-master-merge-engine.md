# 🏛️ RFC-013: Autonomous Resilient Branch Reconciliation & Multi-Strategy Master Merge Engine
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-013 | **Durum:** Approved (Onaylandı) ✅ | **Tarih:** 2026-10-26 | **Yazar:** Aegis Autonomous Engine
- **GitHub Discussion:** [#223 (Ideas)](https://github.com/frkntlr/aegis/discussions/223)
- **Originating Prompt:** `/aegis düzgün biçimde sorun çıkmadan masterda branchları aktarmalı sistem şuanki sistemimiz çok geride kalmış olabilir`

---

## 🔍 1. Fikir ve Problem Tanımı (Root Cause Diagnosis)

Aegis'in mevcut çalışma ağacı (worktree) ve dal birleştirme hattı (`MergePipeline`), otonom kodlama döngüsünde kritik darboğazlar ve riskler barındırmaktadır:

1. **Katı Fast-Forward Bağımlılığı (`--ff-only`):**
   Mevcut sistem `git merge --ff-only aegis/<agent>` mantığıyla çalışır. `master` dalı belgeler, kardeş ajanlar veya harici commit'ler nedeniyle bir adım dahi ilerlemişse doğrusal tarihçe bozulur ve birleştirme derhal başarısız olur (`Fast-forward merge failed. Non-linear history detected`).
2. **Sabit Kodlu Kardeş Ajan Listesi (Static Agent Sibling Drift):**
   Kardeş senkronizasyonu yalnızca statik `['solver', 'qa', 'docs', 'ui']` dizisiyle sınırlandırılmıştır. `contributor` gibi yeni ajanlar veya dinamik özellik dalları (`feature/*`) senkronize edilmez. Nitekim `aegis/contributor` dalının `master`'ın 124 commit gerisinde kalması bu mimari açığın doğrudan kanıtıdır.
3. **CLI Seviyesinde Sahte Doğrulama Kapısı (Bypassed Verification Gate):**
   `core-commands.ts` içerisindeki `handleMerge`, boru hattına `preMergeCheckPassed = true` değerini sabit kodlamaktadır. Gerçek Demir Kafes denetimi (`aegis cage:check`) ve proje test koşumu (`npm test`) birleştirme öncesinde CLI tarafından fiilen çalıştırılmamaktadır.
4. **Çatışma Teşhis ve Geri Alma Yetersizliği:**
   Rebase çatışmaya girdiğinde sistem yalnızca `git rebase --abort` çağırıp süreci kesmektedir. Çatışan dosyaların, sembollerin veya kilitlerin dökümü sunulmamakta; alternatif stratejiler (squash-merge, cherry-pick veya PR fallback) devreye girememektedir.
5. **Veri Kaybı Riski ve Stash Güvencesi Eksikliği:**
   Çalışma ağacında commit edilmemiş değişiklikler varken yürütülen operasyonlar başarısız olmakta, kullanıcı veya ajanın kirli çalışma kopyasını koruyan emniyetli geçici saklama (safety stash & restore) mekanizması bulunmamaktadır.
6. **Çift Yönlü Senkronizasyon Komutu Yokluğu (`aegis branch:sync`):**
   Ajan dallarını `master`'daki en son değişikliklerle güncellemek için bağımsız bir senkronizasyon komutu bulunmamakta; sadece birleştirme sonrasında tek yönlü reset denenmektedir.

Bu RFC, dalların `master`'a veri kaybı ve çatışma olmadan deterministik olarak aktarılmasını sağlayan **Çok Stratejili Otonom Birleştirme ve Dal Uzlaştırma Motoru**'nu tanımlar.

---

## 🏗️ 2. Çok Kademeli Birleştirme Mimarisi (Multi-Tier Merge Pipeline)

Yeni mimari, her birleştirme isteğini 5 aşamalı koruyucu bir protokolden geçirir:

```
[Agent Branch] ──► 1. Pre-Flight Stash Guard & Mutex Audit
                     │
                     ▼
                   2. Deterministic Demir Kafes & Test Verification Gate
                     │
                     ▼
                   3. Multi-Tier Merge Engine:
                      ├─ Tier 1: Fast-Forward (--ff-only)
                      ├─ Tier 2: Safe Rebase + Fast-Forward
                      ├─ Tier 3: Atomic Squash & Clean Commit
                      └─ Tier 4: Non-Destructive Abort & Conflict Diagnostics
                     │
                     ▼
                   4. Dynamic Global Worktree Sibling Reconciliation
                     │ (git worktree list taraması + akıllı rebase/sync)
                     ▼
                   5. Autonomous Pull Request Fallback (opsiyonel / korumalı dal)
```

### Aşama 1: Emniyetli Ön Denetim ve Stash Kalkanı (Safety Stash Guard)
- Çalışma ağacının kirli olup olmadığı (`git status --porcelain`) kontrol edilir.
- Kirli ise `git stash push -m "aegis-pre-merge-safety-<timestamp>"` ile korumaya alınır.
- İşlem tamamlandığında (başarılı veya başarısız) stash geri yüklenir (`git stash pop`), veri kaybı kesinlikle sıfırlanır.
- `WorktreeMutexShield` üzerinden aktif dosya kilitleri (`.aegis/locks.json`) denetlenir.

### Aşama 2: Sert Demir Kafes ve Test Doğrulama Kapısı
- `git diff --name-only <base>...HEAD` ile değişen dosyalar tespit edilir.
- `IronCageValidator` çalıştırılarak değişen dosyaların 300 satır / 40 satır limitlerine uyduğu doğrulanır.
- Projenin test paketi (`npm test` vb.) otomatik koşulur; testler %100 geçmeden `master`'a hiçbir dokunuş yapılmaz.

### Aşama 3: Çok Stratejili Birleştirme (Multi-Tier Execution)
1. **Tier 1 (Fast-Forward):** Eğer hedef dal ve kaynak dal doğrusal ise `git merge --ff-only` çalıştırılır.
2. **Tier 2 (Rebase + FF):** Doğrusal değilse kaynak dal hedef dalın üzerine sessizce rebase edilir. Başarılı olursa fast-forward tamamlanır.
3. **Tier 3 (Atomic Squash & Merge):** Dallarda çok sayıda mikro-commit varsa, Demir Kafes standartlarına uygun cerrahi bir commit mesajıyla birleştirilir.
4. **Tier 4 (Rollback & Diagnostics):** Çatışma tespit edilirse hiçbir dosya bozulmadan `git rebase --abort` veya `git merge --abort` tetiklenir; çatışan dosyalar ve satırlar renkli AST teşhisiyle terminale ve Web Dashboard'a dökülür.

### Aşama 4: Dinamik Global Kardeş Senkronizasyonu (Dynamic Sibling Sync)
- Sabit `['solver', 'qa', 'docs', 'ui']` listesi yerine `git worktree list --porcelain` çıktısı ayrıştırılır.
- Depodaki tüm aktif çalışma ağaçları (örneğin `contributor`, `solver`, `qa`, `docs`, `custom-agent`) otomatik tespit edilir.
- Temiz olan kardeş dallar `master`'ın en son haline otomatik fast-forward / reset edilir.
- Kirli olan kardeş dallar uyarılır, dosyalarına dokunulmaz.

### Aşama 5: Otonom Çift Yönlü Dal Senkronizasyon Komutu (`aegis branch:sync`)
- Yeni CLI komutu: `aegis branch:sync [agent|all]`
- Birleştirme yapmadan da istenen veya tüm dalları `master` ile senkron tutar. Geride kalmış çalışma ağaçları (`aegis/contributor` gibi) tek komutla güncellenir.

---

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır / kaynak dosya (`packages/core/orchestrator/src/merge-pipeline.ts` ve ek modüller).
- Azami 40 satır / fonksiyon.
- Sıfır açık `any`, sıfır yorumsuz boş `catch`.
- Cerrahi unified diff ile tam atomik entegrasyon.

---

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] RFC-013 mimari spesifikasyonu hazırlandı ve GitHub Discussion #223 yayımlandı.
- [ ] `MergePipeline` sınıfına dinamik çalışma ağacı keşfi (`listWorktrees()`) entegre edildi; `contributor` dahil tüm dallar desteklendi.
- [ ] `MergePipeline` içerisine çok kademeli (FF -> Rebase-FF -> Squash) birleştirme stratejisi eklendi.
- [ ] Birleştirme öncesi gerçek Demir Kafes ve test koşum kapısı (`preMergeCheck`) CLI `handleMerge` içerisine bağlandı.
- [ ] Kirli dizinler için Stash Guard mekanizması eklendi.
- [ ] `aegis branch:sync [agent|all]` CLI komutu hayata geçirildi.
- [ ] Birim testler (%100 geçiş) ve mutasyon testi doğrulaması tamamlandı.
