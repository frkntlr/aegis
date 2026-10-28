/**
 * @file spec-worktree.ts
 * Specification: Physical Git Worktrees, Mutex Locks & TIP Protocol.
 * Covers: RFC-013, RFC-019, RFC-026, RFC-034.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const SPEC_WORKTREE_PAGE: WikiSuitePage = {
  slug: 'Spec-Worktree-and-TIP',
  title: 'Mimari Spesifikasyon: Git Worktree İzolasyonu, Kilitler & TIP Protokolü',
  threeBullets: [
    'Fiziksel Git Worktree İzolasyonu (solver, qa, docs, ui) ve Çakışmasız Muteks Dosya Kilitleri (.aegis/locks.json).',
    'Task Ingestion Protocol (TIP) ile çekme tabanlı görev kuyruğu ve 4-Aşamalı Atomik Birleştirme Boru Hattı.',
    'Kapsanan Kararlar: RFC-013, RFC-019, RFC-026, RFC-034.'
  ],
  content: [
    '## 🌲 Mimari Spesifikasyon: Worktree İzolasyonu, Kilitler & TIP',
    '',
    'Aegis, bağımsız LLM ajanlarının tek bir depoda kaos yaratmadan, eş zamanlı ve çakışmasız çalışmasını sağlamak için fiziksel Git worktree izolasyonu ve çekme tabanlı TIP (Task Ingestion Protocol) mimarisi uygular. Bu spesifikasyon; RFC-013, RFC-019, RFC-026 ve RFC-034 kararlarının sentezidir.',
    '',
    '```mermaid',
    'flowchart TD',
    '  ISSUE["GitHub Issue (Projects v2)"] --> INJECT["aegis task:inject <id> [agent]"]',
    '  INJECT --> INBOX[".aegis/task-inbox.json (Staged TIP Kutusu)"]',
    '  INBOX --> PULL["aegis task:pull [role] (task_inbox_pull)"]',
    '  PULL --> CLAIM["aegis task:claim <id> (Dosya Kilitleri .aegis/locks.json)"]',
    '  CLAIM --> WT["İzole Worktree (solver, qa, docs, ui)"]',
    '  WT --> GATE["Multimodal Kalite Kapısı (verify:task)"]',
    '  GATE --> MERGE["4-Aşamalı Atomik Merge (Rebase -> FF -> Sibling Sync)"]',
    '  MERGE --> RELEASE["aegis task:release (Kilitler Çözüldü & Done)"]',
    '```',
    '',
    '---',
    '',
    '### 1. Fiziksel Worktree İzolasyonu & Ajan Rozetleri (RFC-026, RFC-034)',
    '- **`experimental/solver` (`aegis/solver`):** `🛠️ [ISSUE SOLVER] AKTİF` — Kod onarımı, TDD ve Demir Kafes.',
    '- **`experimental/qa` (`aegis/qa`):** `🎯 [QA HUNTER] AKTİF` — UI denetimi, BoundingBox çakışması ve playtesting.',
    '- **`experimental/docs` (`aegis/docs`):** `📚 [DOC ARCHITECT] AKTİF` — GitHub Wiki, mimari RFC ve zemin araştırması.',
    '- **`experimental/ui` (`aegis/ui`):** `🎨 [UI SPECIALIST] AKTİF` — Arayüz sahneleri, temalar (*.tres) ve duyarlı düzenler.',
    '',
    '---',
    '',
    '### 2. Çatışmasız Muteks Dosya Kilitleri (`.aegis/locks.json`)',
    'Ajanlar görev üstlendiğinde hedef dosyalar kilitlenir; diğer ajanların aynı anda o dosyalara müdahale etmesi fiziksel olarak engellenir:',
    '- `task_claim` çağrısı atomik olarak muteks kilidini kaydeder.',
    '- `lock_status` ile aktif kilitler şeffaf biçimde listelenir.',
    '- Görev tamamlandığında veya iptal edildiğinde kilitler anında serbest bırakılır.',
    '',
    '---',
    '',
    '### 3. 4-Aşamalı Atomik Birleştirme Boru Hattı (RFC-013, RFC-019)',
    '1. **Aşama 1 - Multimodal Doğrulama:** Demir Kafes + Birim Testler + Mutasyon Kapısı + Playtest doğrulanır.',
    '2. **Aşama 2 - Upstream Rebase:** Geliştirme dalı güncel `master` üzerine rebase edilir.',
    '3. **Aşama 3 - Hızlı İleri / Atomik Birleştirme:** Fast-forward veya atomik merge commit ile master güncellenir.',
    '4. **Aşama 4 - Dinamik Kardeş Eşitleme (Sibling Sync):** Tüm paralel worktree\'ler kullanıcı değişikliklerini korumak için stash korumalı olarak master ile eşitlenir.',
    '',
    '---',
    '',
    '### 💻 Worktree & TIP Komut ve MCP Referansı',
    '| Komut / MCP Aracı | Görev |',
    '|---|---|',
    '| `aegis status` (`worktree_status`) | Worktree durumlarını ve aktif dosya kilitlerini raporlar. |',
    '| `aegis task:list` (`task_list`) | TIP görev kuyruğundaki işleri listeler (ready, in_progress, blocked). |',
    '| `aegis task:inject <id> [agent]` | Cerrahi prompt hazırlayıp görevi TIP kutusuna enjekte eder. |',
    '| `aegis task:pull [agent]` (`task_inbox_pull`) | Ajanın sıradaki sahnelenmiş görevini çeker. |',
    '| `aegis task:claim <id> [agent]` (`task_claim`) | Görevi ajan için üstlenir ve dosya kilitlerini edinir. |',
    '| `aegis task:release <id> [status]` (`task_release`) | Görevi tamamlar ve kilitleri serbest bırakır. |',
    '| `aegis merge <agent>` | 4-aşamalı atomik merge pipeline çalıştırır. |',
    '| `aegis branch:sync [agent\|--all]` | Worktree dallarını master ile stash-korumalı eşitler. |'
  ].join('\n')
};
