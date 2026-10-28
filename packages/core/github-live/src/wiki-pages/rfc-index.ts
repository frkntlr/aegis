/**
 * @file rfc-index.ts
 * RFC Index page for Aegis Living Memory Wiki.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const RFC_INDEX_PAGE: WikiSuitePage = {
  slug: 'RFC-Index',
  title: 'Aegis Yaşayan Mimari RFC & Karar Kayıtları Dizini',
  threeBullets: [
    'Aegis Çekirdek Motorunun Onaylanmış 35 Mimari Tasarım Belgesi (RFC-001 - RFC-035).',
    'Açık Kaynak Topluluk Fikirleri ile Temiz-Oda Wiki Mimarisi Arasındaki Çift Yönlü Köprü.',
    'Demir Kafes Standartları ve Kabul Kriterleriyle Doğrulanmış Üretim Spesifikasyonları.'
  ],
  content: [
    '## 🏛️ Aegis Yaşayan Mimari RFC & Karar Kayıtları Dizini',
    '',
    'Aegis ekosistemindeki tüm mimari evrimler ve köklü yapısal değişiklikler, **RFC (Request for Comments)** protokolü üzerinden tasarlanır, tartışılır, kabul kriterlerine bölünür ve yaşayan GitHub Wiki sayfalarına dönüştürülür.',
    '',
    '---',
    '',
    '### 🔄 RFC Yaşam Döngüsü',
    '1. **Fikir Tespiti (`aegis ideate "<fikir>"`):** Doğal dille ifade edilen mimari fikir otomatik algılanır.',
    '2. **RFC Taslağı & Tartışma (`aegis rfc:create`):** GitHub Discussions (`Ideas` kategorisi) altında kamuoyuna sunulur.',
    '3. **Temiz Mimari Sentezi (`aegis rfc:approve` / `aegis wiki:clean`):** Onaylanan RFC temiz-oda mimari şartnamesine dönüştürülüp Wiki\'ye işlenir.',
    '4. **Atomik Görev Bölümleme (`aegis rfc:decompose`):** Kabul kriterleri bağımsız GitHub Issue\'larına parçalanarak ajanlara dağıtılır.',
    '',
    '---',
    '',
    '### 📚 Onaylanmış Çekirdek RFC Dokümanları (RFC-001 - RFC-035)',
    '',
    '| RFC No | Başlık ve Mimari Kapsam | Durum | Wiki Bağlantısı |',
    '|---|---|---|---|',
    '| **RFC-001** | **Autonomous NotebookLM Ideation & Gap-Filling Engine:** Doğrulanmış mimari zemin araştırması ve Wiki sentezi. | `Accepted / Implemented` | [[RFC-001-autonomous-notebooklm-ideation-and-gap-filling-engine]] |',
    '| **RFC-002** | **Aegis Godot Bridge:** Godot 4 canlı RPC, ClassDB Oracle, BoundingBox UI ve doctool entegrasyonu. | `Accepted / Implemented` | [[RFC-002-aegis-godot-bridge]] |',
    '| **RFC-003** | **Lightweight Incremental Symbol Index & Evidence-Based Triage:** AST sembol indeksi ve sahte bug önleyici triyaj kapısı. | `Accepted / Implemented` | [[RFC-003-lightweight-incremental-symbol-index-and-evidence-based-bug-triage-gate]] |',
    '| **RFC-004** | **Relational Knowledge Graph & Cross-Reference Engine:** Çağrı ilişkileri, sinyal ve sahne bağlantı çizgesi. | `Accepted / Implemented` | [[RFC-004-relational-knowledge-graph-and-engine-asset-cross-reference-engine]] |',
    '| **RFC-005** | **Language-Specific Clean Architecture & Anti-Spaghetti Guardrails:** TypeScript ve Godot GDScript mimari bariyerleri. | `Accepted / Implemented` | [[RFC-005-language-specific-clean-architecture-and-anti-spaghetti-guardrails-engine]] |',
    '| **RFC-006** | **Integration of ast-grep MCP, RTK Token Killer & Context7:** Yapısal AST arama, log sıkıştırma ve resmi kütüphane dokümantasyonu. | `Accepted / Implemented` | [[RFC-006-rfc-006-integration-of-ast-grep-mcp-rtk-token-killer-and-context7-mcp]] |',
    '| **RFC-007** | **Fortified 5-Layer Codebase Memory IDE Integration Engine:** 5 katmanlı hafıza mimarisinin editörlere entegrasyonu. | `Accepted / Implemented` | [[RFC-007-rfc-007-fortified-5-layer-codebase-memory-ide-integration-engine]] |',
    '| **RFC-008** | **Comprehensive 5-Layer Codebase Memory IDE Gap Remediation:** Hafıza motorundaki uç durumların ve IDE boşluklarının giderilmesi. | `Accepted / Implemented` | [[RFC-008-rfc-008-comprehensive-5-layer-codebase-memory-ide-gap-remediation-engine]] |',
    '| **RFC-009** | **Deep Logic Defects Remediation & Autonomous Execution Hardening:** Otonom yürütme motorunun mantıksal kusurlardan arındırılması. | `Accepted / Implemented` | [[RFC-009-rfc-009-deep-logic-defects-remediation-autonomous-execution-hardening-engine]] |',
    '| **RFC-010** | **Deterministic Context Memory Auto-Sync & Cold Start Indexing:** Otomatik hafıza eşitleme ve soğuk başlangıç indeksleyici. | `Accepted / Implemented` | [[RFC-010-deterministic-context-memory-auto-sync-cold-start-full-indexing-post-edit-write-through]] |',
    '| **RFC-011** | **Enterprise .NET C# Toolchain:** Windows Desktop ve Linux Native C# çok dilli orkestrasyon desteği. | `Accepted / Implemented` | [[RFC-011-enterprise-net-c-windows-desktop-linux-native-application-toolchain]] |',
    '| **RFC-012** | **Demir Kafes Autonomous Architectural Decomposition:** Fiziksel Git hookları ile karmaşıklık kapısı ve anti-degradasyon motoru. | `Accepted / Implemented` | [[RFC-012-demir-kafes-autonomous-architectural-decomposition-anti-degradation-engine]] |',
    '| **RFC-013** | **Autonomous Resilient Branch Reconciliation & Multi-Strategy Master Merge:** Çok kademeli atomik birleştirme boru hattı. | `Accepted / Implemented` | [[RFC-013-autonomous-resilient-branch-reconciliation-multi-strategy-master-merge-engine]] |',
    '| **RFC-014** | **Socratic Evidence-Based Diagnostic Dialogue Engine:** 3 turlu Sokratik hipotez ve kanıt tabanlı hata ayıklayıcı. | `Accepted / Implemented` | [[RFC-014-socratic-evidence-based-diagnostic-dialogue-engine]] |',
    '| **RFC-015** | **Socratic Interactive Debugging & Antigravity Harmony:** Antigravity ile derin uyumlu etkileşimli hata teşhis protokolü. | `Accepted / Implemented` | [[RFC-015-socratic-interactive-debugging-and-antigravity-harmony]] |',
    '| **RFC-016** | **Symbiotic Substrate 2.0 & Contract Drift Radar:** Bounded Transitive Type Closure, Opaque Stubbing ve lockfile hash radarı. | `Accepted / Implemented` | [[RFC-016-symbiotic-substrate-2.0-hardening-and-contract-drift-radar]] |',
    '| **RFC-017** | **Zero-Chromium NotebookLM Bridge:** Bağımsız HTTP/JSON tabanlı sıfır-chromium istemci entegrasyonu. | `Accepted / Implemented` | [[RFC-017-zero-chromium-notebooklm-bridge]] |',
    '| **RFC-018** | **Autonomous Deep Research Loop & Freshness Pruning:** Otonom derin araştırma ve bilgi tazeliği döngüsü. | `Accepted / Implemented` | [[RFC-018-autonomous-deep-research-loop-freshness-pruning-substrate]] |',
    '| **RFC-019** | **Speculative Multi-Agent Execution & Invariant Verification:** Paralel hipotez yürütme ve turnuva doğrulama kapısı. | `Accepted / Implemented` | [[RFC-019-speculative-multi-agent-execution-transactional-invariant-verification-substrate]] |',
    '| **RFC-020** | **Interactive Auth Resolution Tri-State Protocol:** NotebookLM için kesintisiz modal yetkilendirme ve rızaya dayalı düşüş. | `Accepted / Implemented` | [[RFC-020-interactive-auth-resolution-tri-state-fallback-protocol-notebooklm]] |',
    '| **RFC-021** | **Universal Chromium Browser Bridge & Interactive CDP Substrate:** Tarayıcı tespiti, izole kullanıcı verisi ve uzaktan CDP köprüsü. | `Accepted / Implemented` | [[RFC-021-universal-chromium-browser-bridge-and-interactive-cdp-substrate]] |',
    '| **RFC-022** | **Ambient Harvester & Conversational Account Switch Protocol:** Sıfır-tıklama ortam tarayıcısı, DPAPI çerez kasası ve Tri-State yetkilendirme. | `Accepted / Implemented` | [[RFC-022-ambient-harvester-and-conversational-account-switching]] |',
    '| **RFC-023** | **Autonomous Knowledge Lifecycle Management & Quota Sentinel:** 50-kaynak tavanı koruması, MFCS tasfiye ve Mezar Taşı Mahzeni. | `Accepted / Implemented` | [[RFC-023-autonomous-knowledge-lifecycle-management-quota-sentinel-source-freshness-radar]] |',
    '| **RFC-024** | **Next-Gen Evidence-Based Bug Triage Engine:** Çok çekirdekli paralellik, artımlı önbellek ve patlama yarıçapı tabakalaşması. | `Accepted / Implemented` | [[RFC-024-next-gen-evidence-based-bug-triage-engine-incremental-caching-multi-core-parallelism-blast-radius-stratification]] |',
    '| **RFC-025** | **Turborepo Acceleration & Content-Addressed Caching:** Git hookları için Turborepo önbelleği ve anında test geçişi. | `Accepted / Implemented` | [[RFC-025-turborepo-acceleration-content-addressed-caching-for-git-pre-commit-and-pre-push-hooks]] |',
    '| **RFC-026** | **Cold-Start Indexer Worktree Isolation:** Worktree dizin izolasyonu ile gereksiz AST yürüyüşlerinin elenmesi. | `Accepted / Implemented` | [[RFC-026-cold-start-indexer-worktree-isolation-and-redundant-ast-walk-elimination]] |',
    '| **RFC-027** | **Web Dashboard Test Performance & Process Spawn Optimization:** Test paketinde gereksiz süreç üretiminin engellenmesi. | `Accepted / Implemented` | [[RFC-027-web-dashboard-test-performance-and-process-spawn-optimization]] |',
    '| **RFC-028** | **High-Performance Windows Process Termination:** Görev ağaçlarının taskkill /T /F ile sızdırmaz biçimde kapatılması. | `Accepted / Implemented` | [[RFC-028-rfc-025-high-performance-windows-process-termination-and-adaptive-watchdog-sampling-engine]] |',
    '| **RFC-029** | **High-Performance Zero-Roundtrip GitHub Wiki Synchronization:** Sıfır ağ gecikmeli yerel git radarı ve iki yönlü senkronizasyon. | `Accepted / Implemented` | [[RFC-029-high-performance-zero-roundtrip-github-wiki-synchronization-substrate]] |',
    '| **RFC-030** | **Deterministic Zero-Latency Offline Git Substrate:** Wiki yaşayan hafızasında soket zaman aşımı koruması ve çevrimdışı çalışma. | `Accepted / Implemented` | [[RFC-030-deterministic-zero-latency-offline-git-substrate-and-socket-timeout-elimination-in-wiki-living-memory]] |',
    '| **RFC-031** | **CLI Test Suite Acceleration:** Süreç üretiminin elenmesi ve kapsamlı bellek soğuk başlangıcı ile test hızlandırma. | `Accepted / Implemented` | [[RFC-031-cli-test-suite-acceleration-process-spawn-elimination-and-scoped-memory-cold-start]] |',
    '| **RFC-032** | **Deterministic Incremental Caching for Demir Kafes (Fast-Stat Radar):** mtime ve dosya boyutu radarıyla anlık cage:check denetimi. | `Accepted / Implemented` | [[RFC-032-deterministic-incremental-caching-for-demir-kafes-cagecheck-via-fast-stat-cache-radar]] |',
    '| **RFC-033** | **Monorepo TypeScript Project References & Incremental Build Engine:** composite: true ve Turborepo ile derleme süresinin %80 kısaltılması. | `Accepted / Implemented` | [[RFC-033-monorepo-typescript-project-references-turborepo-optimization]] |',
    '| **RFC-034** | **Google Antigravity & Aegis Bidirectional Orchestration & TIP Bridge:** Evrensel CLI (aegis), Task Ingestion Protocol ve 19 MCP aracı. | `Accepted / Implemented` | [[RFC-034-google-antigravity-bidirectional-orchestration-and-task-bridge]] |',
    '| **RFC-035** | **Godot Substrate 3.0 Full Lifecycle Engine Harness & Quality Gates:** Canlı WebSocket RPC köprüsü, ClassDB Oracle, deterministik port yönlendirme, derleyici ön-kontrolü, 27-araçlık MCP ve UI telemetrisi. | `Accepted / Implemented` | [[RFC-035-godot-substrate-3-0-full-lifecycle-engine-harness-and-quality-gates]] |'
  ].join('\n')
};
