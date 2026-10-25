import type { WikiSuitePage } from '../types.js';

export const RFC_INDEX_PAGE: WikiSuitePage = {
  slug: 'RFC-Index',
  title: 'Aegis Yaşayan Mimari RFC & Karar Kayıtları Dizini',
  threeBullets: [
    'Aegis Çekirdek Motorunun Onaylanmış 9 Mimari Tasarım Belgesi (RFC-001 - RFC-009).',
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
    '3. **Temiz Mimari Sentezi (`aegis rfc:approve`):** Onaylanan RFC temiz-oda mimari şartnamesine dönüştürülüp Wiki\'ye işlenir.',
    '4. **Atomik Görev Bölümleme (`aegis rfc:decompose`):** Kabul kriterleri bağımsız GitHub Issue\'larına parçalanarak ajanlara dağıtılır.',
    '',
    '---',
    '',
    '### 📚 Onaylanmış Çekirdek RFC Dokümanları (RFC-001 - RFC-009)',
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
    '| **RFC-009** | **Deep Logic Defects Remediation & Autonomous Execution Hardening:** Otonom yürütme motorunun mantıksal kusurlardan arındırılması. | `Accepted / Implemented` | [[RFC-009-rfc-009-deep-logic-defects-remediation-autonomous-execution-hardening-engine]] |'
  ].join('\n')
};
