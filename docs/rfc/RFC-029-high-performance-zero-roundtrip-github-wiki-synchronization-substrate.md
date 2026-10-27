# 🏛️ RFC-029: High-Performance Zero-Roundtrip GitHub Wiki Synchronization Substrate
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-029 | **Durum:** Approved (Onaylandı) ✅ | **Tarih:** 2026-10-27
- **Yazar:** Aegis Autonomous Core Fleet
- **İlişkili Tartışma:** [GitHub Discussion #304](https://github.com/frkntlr/aegis/discussions/304)

---

## 🔍 1. Fikir ve Problem Tanımı

### 1.1 Mevcut Darboğaz
Yapılan performans testinde `aegis wiki:sync` senkronizasyonunun **4.264 ms (~4.3 saniye)** sürdüğü ve sistem gecikmesinin neredeyse tamamının **Ağ I/O (GitHub Remote Git over HTTPS)** operasyonlarından kaynaklandığı tespit edilmiştir.

### 1.2 Kök Neden Teşhisi
1. **Ardışık 3 Bloklayıcı Ağ İsteği:** Her senkronizasyon çağrısında, yerel depoda veya uzak depoda hiçbir değişiklik olmasa dahi `git ls-remote`, `git pull` ve `git push` art arda çalıştırılmaktadır.
2. **Yerel Değişiklik Radarı Eksikliği:** `.aegis/wiki-cache` dizinindeki dosyaların kirli (`dirty`) olup olmadığı (`git status --porcelain`) kontrol edilmemekte, tertemiz depolarda bile `git push` ağı meşgul etmektedir.
3. **Commit Edilmemiş Dosyaların Atlanması:** `pushAllToRemote()` içinde `git add` veya `git commit` adımı bulunmadığından, yeni oluşturulan veya güncellenen yerel wiki sayfaları commit edilmeden push yapılmaya çalışılmaktadır.
4. **Lüzumsuz ls-remote Ön Kontrolü:** `git pull` zaten uzak depoya bağlandığı halde öncesinde çalıştırılan `git ls-remote` fazladan 1.5 saniye kaybettirmektedir.
5. **Senkronizasyon Durum Damgası (TTL Manifest) Eksikliği:** Art arda çalışan otonom ajan komutlarında gereksiz yere ağ çağrısı tetiklenmektedir.

---

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)

1. **Local Dirty Radar (`checkLocalDirtyState`):**
   - `.aegis/wiki-cache` içindeki değişiklikleri `git status --porcelain` ile anında tespit eder (< 15 ms).
   - Kirli dosya varsa otomatik atomik evreleme (`git add .`) ve commit (`git commit -m "docs(wiki): update living memory"`) yapar.
2. **Ahead/Behind Commit Tracker (`getCommitDivergence`):**
   - Yerel HEAD ile `origin/master` arasındaki farkı hesaplar (`git rev-list --left-right --count HEAD...origin/master`).
   - Yerel dal önde değilse `git push` tamamen atlanır (0 ms push).
3. **Smart Reconcile Pipeline (`reconcileRemote`):**
   - 3 ağ çağrısını tek bir `git fetch origin master` içine indirger.
   - Duruma göre:
     - Eşitse: 0 ek ağ isteği.
     - Uzak öndeyse: Fast-forward rebase/merge (0 ms yerel ağ).
     - Yerel öndeyse: Tek bir `git push` (1 ağ isteği).
4. **TTL Sync State Manifest (`.aegis/wiki-sync-state.json`):**
   - Son senkronizasyon zamanı, commit SHA'sı ve durumunu tutar.
   - TTL (örn. 60 sn) içinde yerel mtime/hash değişikliği yoksa 1-5 ms içinde `ALREADY_IN_SYNC` döner.
   - `--force` parametresi ile istenirse bypass edilir.

---

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon.
- Cerrahi unified diff prensibi.
- Pre-commit ve CI birim testleri %100 geçmek zorundadır.

---

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [ ] `checkLocalDirtyState` fonksiyonu yerel değişiklikleri doğru tespit edip commit ediyor.
- [ ] Değişiklik olmayan durumlarda `git push` tetiklenmiyor (0 ms push süresi).
- [ ] `git ls-remote` gereksiz ön çağrısı kaldırıldı veya TTL ile önbelleklendi.
- [ ] TTL manifesti ile 60 saniye içindeki ardışık çağrılar < 10 ms içinde dönüyor.
- [ ] Birim testler (145+ test) %100 başarılı ve yeni testlerle doğrulanmış durumda.
- [ ] Demir Kafes (300/40 satır) AST doğrulaması sağlandı.
