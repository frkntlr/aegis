# 🏛️ RFC-011: Enterprise .NET C#, Windows Desktop & Linux Native Application Toolchain
### Aegis Autonomous Architecture Blueprint

- **RFC ID:** RFC-011 | **Durum:** Proposed | **Tarih:** 2026-10-25 | **Yazar:** Aegis Autonomous Engine
- **GitHub Discussion:** [#220 (Ideas)](https://github.com/frkntlr/aegis/discussions/220)

---

## 🔍 1. Fikir ve Problem Tanımı

Aegis'in 5-Katmanlı Kod Hafızası (`CodebaseMemoryEngine`) ve AST iskelet motoru (`SkeletonGenerator`, `PolyglotParser`), ilk aşamada TypeScript/JavaScript, Python, GDScript, Rust, Go ve C/C++ üzerinde odaklanmıştı.

Ancak kurumsal yazılım geliştirme, masaüstü uygulamaları (Windows Desktop) ve sistem/sunucu düzeyinde yerel Linux uygulamaları (Linux Daemons, CLI, POSIX Services) için şu kritik eksiklikler bulunmaktadır:
1. **.NET & C# Ekosistemi Desteği Yok:** C# (`.cs`), F# (`.fs`), XAML (`.xaml`), `.csproj` gibi Windows Presentation Foundation (WPF), WinUI 3, .NET MAUI ve ASP.NET Core uygulamalarını inşa edecek AST iskelet çıkarıcı (`CSharpSkeletonExtractor`), sembol ayrıştırıcı ve hafıza indekslemesi bulunmuyor.
2. **Linux Sistem ve Betik Ekosistemi Desteği Sınırlı:** Bash/Shell (`.sh`, `.bash`), Systemd servis tanımları, Makefile/CMake yapılandırmaları doğrudan AST sembolü ve iskelet olarak işlenmiyor; bu da Linux yerel araçları ve otomasyonlarında token israfına ve halüsinasyona yol açıyor.
3. **5-Katmanlı Kod Hafızasında Dil Desteği:** `CodebaseMemoryEngine` ve `LiveHotPatcher` dosya uzantısı filtrelerinde `.cs`, `.xaml`, `.sh`, `.bash` yer almadığı için bu dillerdeki projelerde kod hafızası körleşmektedir.

---

## 🏗️ 2. Hedeflenen Mimari ve Çözüm Tasarımı

### A. .NET & C# AST İskelet Çıkarıcı (`CSharpSkeletonExtractor`)
- **Dosya Kapsamı:** `.cs`
- **İskeletleştirme Kuralları:**
  - `namespace Foo.Bar;` (file-scoped) ve `namespace Foo.Bar { ... }` (block-scoped) desteği.
  - Sınıf (`class`), Arayüz (`interface`), Yapı (`struct`), Kayıt (`record`, `record class`, `record struct`), Numaralandırma (`enum`) tanımları.
  - Öznitelikler (`[HttpGet]`, `[Authorize]`, `[ObservableProperty]`, `[DllImport]`).
  - Özellikler (`public string Name { get; set; }` veya expression-bodied `=> ...;`).
  - Metot gövdeleri katlanarak `/* body */` veya tek satırlık `throw null;` / süslü parantez ile token tasarrufu sağlanır (%70-%85 token tasarrufu).

### B. Polyglot C# Sembol Ayrıştırıcı (`PolyglotParser.parseCSharp`)
- Sembol türleri: `class`, `interface`, `struct`, `record`, `method`, `property`, `enum`.
- `SymbolIndex` ve `RelationalGraph` için tip hiyerarşisi (inheritance, interface implementation, method call edges).

### C. Linux Native & Shell İskelet Çıkarıcı (`BashSkeletonExtractor`)
- **Dosya Kapsamı:** `.sh`, `.bash`
- Fonksiyon tanımları (`function foo() { ... }`, `foo() { ... }`), shebang (`#!/usr/bin/env bash`), dışa aktarılan ortam değişkenleri (`export VAR=...`).
- Fonksiyon gövdelerinin katlanması (`{ /* body */ }`).

### D. 5-Katmanlı Hafıza ve Live Hot-Patcher Entegrasyonu
- `CodebaseMemoryEngine.indexDirectory` ve `LiveHotPatcher.SUPPORTED_EXTS` listesine `.cs`, `.xaml`, `.sh`, `.bash` uzantılarının eklenmesi.
- Windows Win32 / P/Invoke ve Linux Systemd servis şablonları için Context7 ve Demir Kafes standartlarının uyarlanması.

---

## 📊 3. Mevcut vs Hedeflenen Destek Kıyaslama Matrisi

| Dil / Ekosistem | Mevcut Durum | Hedeflenen Durum (RFC-011) | Katkı ve Fayda |
| :--- | :--- | :--- | :--- |
| **C# (.NET 8/9, WPF, WinUI 3, ASP.NET Core)** | Desteklenmiyor (ham metin olarak okunuyor, token şişmesi) | `CSharpSkeletonExtractor` + `PolyglotParser.parseCSharp` ile %80 token tasarruflu cerrahi iskelet çıkarma. | Windows Masaüstü ve Enterprise .NET projeleri tam hafıza desteği kazanır. |
| **Linux Shell (.sh, .bash)** | Desteklenmiyor | `BashSkeletonExtractor` ile fonksiyon ve export ayrıştırması. | Linux CLI, daemon ve CI/CD betikleri token harcamadan indekslenir. |
| **XAML / UI (.xaml)** | Desteklenmiyor | XML/XAML UI eleman indeksleme ve `x:Class` ilişkisel bağlayıcı. | WPF ve WinUI arayüzleri ile arka plan C# sınıfları grafiğe bağlanır. |
| **C / C++ (Linux / Windows Native)** | Mevcut (`CppSkeletonExtractor`) | Mevcut C/C++ motoru korunur, CMake/Makefile desteğiyle pekiştirilir. | Yerel sistem ve driver/service seviyesinde sıfır halüsinasyon. |
| **5-Layer Memory Entegrasyonu** | Sadece TS, PY, GD, RS, GO, CPP | `.cs`, `.xaml`, `.sh`, `.bash` otomatik index ve write-through desteği. | Geliştirici hangi dili kullanırsa kullansın tam bağlam hafızası. |

---

## 🔒 4. Demir Kafes ve Mimari Standartlar
- Max 300 satır / dosya, max 40 satır / fonksiyon.
- Sıfır harici ağır bağımlılık; yerel regex & streaming parser mimarisiyle milisaniyeler seviyesinde AST parsing.
- Demir Kafes C# kuralı: 1 sınıf = 1 dosya, max 300 satır, max 40 satır metot.

---

## 🎯 5. Kabul Kriterleri (Acceptance Criteria)
- [ ] `CSharpSkeletonExtractor` oluşturuldu ve `.cs` dosyalarında %70+ token tasarrufu sağlandı.
- [ ] `BashSkeletonExtractor` oluşturuldu ve `.sh` / `.bash` fonksiyonlarını başarıyla çıkardı.
- [ ] `PolyglotParser.parseCSharp` eklendi ve C# sınıfları/metotları `SymbolIndex`'e aktarıldı.
- [ ] `SkeletonGenerator` ve `CodebaseMemoryEngine` yeni dilleri varsayılan olarak destekliyor.
- [ ] Birim testler (%100 pass) ve mutasyon testi onayından (%100 Kill Score) geçti.
