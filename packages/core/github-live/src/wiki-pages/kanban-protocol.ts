/**
 * @file kanban-protocol.ts
 * Consolidation notice for Autonomous Kanban & TIP Protocol.
 * Consolidated into master Architecture guide.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import type { WikiSuitePage } from '../types.js';

export const KANBAN_PROTOCOL_PAGE: WikiSuitePage = {
  slug: 'Autonomous-Kanban-Protocol',
  title: 'GitHub Projects v2 & Otonom Görev Protokolü (TIP)',
  threeBullets: [
    'GitHub Projects v2 ile canlı GraphQL iki yönlü görev senkronizasyonu.',
    'Task Ingestion Protocol (TIP): .aegis/task-inbox.json staged görev köprüsü ve çekme tabanlı mimari.',
    'Görev Yaşam Döngüsü (ready -> in_progress -> review -> done), Kendi Kendini Onaran Nöbetçi ve Devre Kesici.'
  ],
  content: [
    '## 📋 GitHub Projects v2 & Otonom Görev Protokolü (TIP)',
    '',
    '> [!NOTE]',
    '> Bu mimari bileşen, dokümantasyon bütünlüğü ve sadeleştirme amacıyla **[[Architecture|Aegis Kapsamlı Mimari Rehberi (Bölüm 3)]]** altında birleştirilmiştir.',
    '',
    'Aegis, görev yönetiminde geçici listeler yerine kurumsal GitHub Projects v2 ve Task Ingestion Protocol (TIP) çekme tabanlı görev boru hattını uygular:',
    '',
    '- **Çekme Tabanlı TIP:** Görevler `aegis task:inject` ile `.aegis/task-inbox.json` içine hazırlanır; ajanlar `task_inbox_pull` ile atomik olarak çeker.',
    '- **Atomik Dosya Kilitleri:** Görevi alan ajan hedef dosyaları `.aegis/locks.json` ile kilitler; eşzamanlı çakışmalar engellenir.',
    '- **Görev Yaşam Döngüsü:** `ready` -> `in_progress` -> `review` -> `done` (veya Circuit Breaker ile `blocked`).',
    '- **Aegis Web Komuta Merkezi Panosu (`localhost:3000`):** Canlı drag-and-drop Kanban, SSE olay akışı ve aktif ajan oturum takibi.',
    '- **Kendi Kendini İyileştirme:** Sahipsiz veya terk edilmiş `in_progress` görevleri otomatik tespit edilerek `ready` kuyruğuna iade edilir.',
    '',
    'Detaylı şemalar ve TIP protokol akışı için **[[Architecture|Aegis Kapsamlı Mimari Rehberi]]** sayfasına bakınız.',
    '',
    '### İlgili CLI Komutları',
    '- `aegis task:list [status]`: TIP görev kuyruğunu listeler.',
    '- `aegis task:pull [agent]`: Sıradaki görevi atomik çeker.',
    '- `aegis lock:status`: Aktif dosya kilitlerini raporlar.',
    '- `aegis dashboard [port]`: Web Komuta Merkezi panosunu başlatır.'
  ].join('\n')
};
