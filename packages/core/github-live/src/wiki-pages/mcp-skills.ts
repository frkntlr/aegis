/**
 * @file mcp-skills.ts
 * Consolidation notice for MCP & Skills Ecosystem.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const MCP_SKILLS_PAGE: WikiSuitePage = {
  slug: 'MCP-and-Skills-Ecosystem',
  title: 'Evrensel MCP & Beceri (Skills) Senkronizasyon Motoru',
  threeBullets: [
    'Aegis Yerel Stdio JSON-RPC MCP Sunucusu (aegis mcp) ile 27 adet cerrahi kodlama, hafıza ve Godot Substrate 3.0 aracı.',
    'Task Ingestion Protocol (TIP) MCP Araçları: task_list, task_claim, task_release, task_inbox_pull, lock_status.',
    'Deterministik MCP Güvenlik Katmanı (RBAC), Hız Sınırlama ve 5 Uzman Ajan Rolü Matrisi.'
  ],
  content: [
    '## 🔌 Evrensel MCP & Beceriler (Skills) Ekosistemi',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 4)]]** altında birleştirilmiştir.',
    '',
    'Aegis, bağımsız bir işlem olarak çalışan ve doğrudan IDE\'lere bağlanan deterministik 27 adet yerel stdio MCP aracı sunar:',
    '',
    '- **Hafıza & Gezinme (4 Araç):** `memory_query`, `memory_stats`, `find_symbol`, `trace_relational`.',
    '- **AST & Satır Bütçesi (4 Araç):** `ast_search`, `ast_replace`, `skeleton_extract`, `budget_inspect`.',
    '- **Kalite & Teşhis (5 Araç):** `cage_check`, `triage`, `socratic_diagnose`, `context7_query`, `rtk_compress`.',
    '- **TIP & Kilit Yönetimi (6 Araç):** `task_inbox_pull`, `task_claim`, `task_release`, `task_list`, `lock_status`, `worktree_status`.',
    '- **Godot Substrate 3.0 (8 Araç):** `aegis_godot_status`, `aegis_godot_validate`, `aegis_godot_playtest`, `aegis_godot_inspect_ui`, `aegis_godot_tree`, `aegis_godot_signals`, `aegis_godot_screenshot`, `aegis_godot_eval`.',
    '',
    'Detaylı parametre listeleri ve rol matrisleri için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis mcp`: Yerel stdio JSON-RPC MCP sunucusunu başlatır.',
    '- `aegis ide:sync`: MCP yapılandırmasını ve becerileri tüm IDE\'lere dağıtır.'
  ].join('\n')
};
