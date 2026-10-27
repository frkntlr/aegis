# 🏛️ RFC-027: Web Dashboard Test Performance and Process Spawn Optimization
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-027 | **Durum:** Approved (Onaylandı) ✅ | **Tarih:** 2026-10-27 | **Discussion:** https://github.com/frkntlr/aegis/discussions/302

## 🔍 1. Fikir ve Problem Tanımı
`packages/web-dashboard` test süiti ~20 saniye sürerek tüm monorepo test süresinin %38'ini tek başına tüketmektedir.
Gerçekleştirilen derin teşhiste aşağıdaki kök nedenler tespit edilmiştir:
1. **HTTP Server Lifecycle Churn (Port 0):** `dashboard.test.js` ve `dashboard-server.test.js` içerisinde 14 kez sıfırdan HTTP sunucusu açılıp kapatılmaktadır. Özellikle `dashboard-server.test.ts` içindeki 7 route/CORS testi her biri ayrı sunucu ayağa kaldırmaktadır.
2. **ProjectHub.discoverProjects Ağ Çağrısı Sızıntısı:** `discoverProjects` offline modunu veya test ortamını kontrol etmeden her `new DashboardServer()` çağrısında arka planda GitHub GraphQL API'sine istek atmaktadır (~3.054 ms/istek).
3. **Windows tasklist Süreç Yükü:** `IdeLauncher.detectRunningIdes()` her `getStatusPayload()` çağrısında `tasklist /FO CSV /NH` çalıştırmaktadır (~353 ms/çağrı).
4. **Tekrarlanan git worktree list Çağrıları:** `WorktreeManager.listWorktrees()` çağrısı `getStatusPayload()` ve `SessionDetector.detectSessions()` tarafından milisaniyeler arayla iki kez ardışık tetiklenmektedir (~120 ms * 2).
5. **RealtimeMetricsService Monorepo Dosya Taraması:** Her snapshot çağrısında 491 dosya diskten taranmakta ve ilk çağrıda 367 dosya AST/Kafes analizine tabi tutulmaktadır.

## 🏗️ 2. Düğüm & Bileşen Mimarisi (Component Breakdown)
1. **Shared Fixture Pattern (`dashboard-server.test.ts`):** `node:test`'in `before` ve `after` kancaları kullanılarak tek bir paylaşımlı `DashboardServer` (port: 0) ayağa kaldırılır. 7 ayrı sunucu aç-kapa döngüsü 1'e indirilir.
2. **Offline & Test Guard (`ProjectHub.discoverProjects`):** `this.offline` veya test ortamı (`NODE_ENV === 'test'` / `process.execArgv.includes('--test')`) tespit edildiğinde canlı ağ çağrısı baypas edilir.
3. **TTL Caching Substrate (`IdeLauncher.detectRunningIdes`):** 3 saniyelik bir TTL önbelleği ile ardışık durum sorgularında Windows `tasklist` süreç çağrıları engellenir.
4. **Worktree Caching & Mutation Invalidation (`WorktreeManager.listWorktrees`):** 2 saniyelik TTL ile worktree listesi önbelleğe alınır, `ensureWorktree` ve `removeWorktree` işlemlerinde önbellek geçersiz kılınır.
5. **Snapshot File Listing Caching (`RealtimeMetricsService`):** Dosya listeleme sonuçları önbelleklenerek disk I/O operasyonları minimize edilir.

## 🔒 3. Demir Kafes Standartları
- Azami 300 satır/dosya, azami 40 satır/fonksiyon.
- Cerrahi unified diff ilkelerine tam uyum.
- Öncesi ve sonrası 100% test geçme garantisi.

## 🎯 4. Kabul Kriterleri (Acceptance Criteria)
- [x] Kök nedenler tespit edildi ve GitHub Discussion #302 altına raporlandı.
- [x] `ProjectHub.discoverProjects` offline & test ortamı koruması eklendi.
- [x] `IdeLauncher.detectRunningIdes` TTL önbelleği eklendi.
- [x] `WorktreeManager.listWorktrees` TTL önbelleği ve mutasyon geçersiz kılma eklendi.
- [x] `dashboard-server.test.ts` paylaşımlı tekil sunucu desenine geçirildi.
- [x] `packages/web-dashboard` test süresi ~20 saniyeden belirgin şekilde düşürüldü (~2.68 - 5.9 saniyeye, %70-%86 iyileşme).
- [x] Tüm testler %100 yeşil (34/34 test geçti) ve Demir Kafes uyumlu (22/22 dosya).
- [x] Çözüm ve performans kazanımları GitHub Discussion #302'ye aktarıldı.
