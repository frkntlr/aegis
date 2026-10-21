# ⚖️ Aegis Agent Constitution (Ajan Anayasası)

> [!CAUTION]
> Bu maddeler AI modellerine prompt olarak tavsiye edilmez — Git Hook'lar, Linter'lar ve AST doğrulamaları aracılığıyla deterministik olarak uygulanır.

## 14 Temel Anayasa Maddesi

| # | Madde | Uygulama Mekanizması | İhlal Sonucu |
|---|-------|---------------------|--------------|
| **1** | `main` dalına doğrudan commit yasaktır | Git Hook (`branch-guard`) | Commit reddedilir |
| **2** | Fonksiyon uzunluğu 40 satırı geçemez | ESLint (`max-lines-per-function`) | Linter Gate durdurur |
| **3** | Dosya uzunluğu 300 satırı geçemez | ESLint (`max-lines`) | Linter Gate durdurur |
| **4** | Cyclomatic Complexity > 10 olamaz | ESLint / Complexity Gate | Linter Gate durdurur |
| **5** | Ölü kod veya kullanılmayan export bırakılamaz | Knip / Dead Code Scanner | Commit engellenir |
| **6** | Tüm dosya baştan yazılamaz (Sadece Unified Diff) | Diff-Size & Patch Guard | Patch reddedilir |
| **7** | Testi olmayan yeni kod commit edilemez | Pre-commit Test Runner | Commit engellenir |
| **8** | Kabul kriterleri doğrulanmadan PR/Merge yapılamaz | `aegis verify` doğrulama kancası | Merge reddedilir |
| **9** | Adaptif timeout tahmini yapılmadan test koşulamaz | Pre-Execution Estimator | Süreç başlatılamaz |
| **10** | Aynı test hatası 2 kezden fazla tekrarlanamaz | Diff-Hash Loop Detector | Token Freni (Circuit Breaker) |
| **11** | Test dosyaları ajan tarafından modifiye edilemez | Trust Verifier (Immutable Oracle) | Şüpheli bayrak + İnsan İncelemesi |
| **12** | Mutation testing skoru < %70 olamaz | Stryker / Mutmut Gate | Commit reddedilir |
| **13** | İzolasyon dışı host komutu çalıştırılamaz | Container Sandbox / Jail | Komut engellenir |
| **14** | İzin listesi dışı MCP tool'u çağrılamaz | MCP Security RBAC Layer | Erişim reddedilir |
