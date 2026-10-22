import { DASHBOARD_CSS } from './dashboard-styles.js';

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aegis Command Center | Real-Time Mulgravity Hub</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <header>
    <div class="logo-group">
      <div class="logo-badge">AEGIS</div>
      <div>
        <h1 style="font-size: 1.25rem; font-weight: 700;">Command Center</h1>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Real-Time Mulgravity & Multi-Editor Hub</p>
      </div>
    </div>
    <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
      <span id="sse-badge" style="font-size: 0.75rem; background: rgba(63,185,80,0.15); color: var(--green-glow); padding: 0.35rem 0.65rem; border-radius: 999px; border: 1px solid rgba(63,185,80,0.3);">● SSE CANLI</span>
      <button class="btn btn-secondary" onclick="sendAction('scan_ast')">AST Tara 🗺️</button>
      <button class="btn btn-secondary" onclick="sendAction('verify_cage')">Demir Kafes 🛡️</button>
      <button class="btn btn-secondary" onclick="promptNewTask()">Yeni Görev ➕</button>
      <button class="btn btn-secondary" onclick="sendAction('release_locks')">Kilitleri Aç 🔓</button>
      <button class="btn" onclick="sendAction('auto')">Otonom Dağıtıcı (/auto) ▶</button>
    </div>
  </header>

  <!-- TOP METRICS ROW -->
  <div class="grid">
    <!-- Token Thermometer -->
    <div class="card">
      <div class="card-title">
        <span>Token & Bağlam Termometresi</span>
        <span id="savings-badge" style="color: var(--green-glow); font-weight: bold;">%74 Tasarruf</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted);">Cerrahi AST İskeletleme & Prompt Caching Katmanı</p>
      <div class="thermometer-container">
        <div class="thermometer-bar" id="thermo-bar" style="width: 74%;"></div>
      </div>
      <div class="token-stats">
        <span>Kullanılan: <strong id="used-tokens">4.8K</strong></span>
        <span>Önbellekten Bedava: <strong id="cached-tokens">14.2K</strong></span>
        <span>Kotadan Kalan: <strong id="quota-rem">95%</strong></span>
      </div>
    </div>

    <!-- Quality Shields -->
    <div class="card">
      <div class="card-title">
        <span>Deterministik Kalite Kalkanları</span>
        <span style="color: var(--green-glow);">Aktif (0 Token)</span>
      </div>
      <div class="shields-grid">
        <div class="shield-item">
          <div class="shield-light"></div>
          <div>
            <div class="shield-label">TDD Birim Testleri</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);" id="tdd-label">24/24 Yeşil</div>
          </div>
        </div>
        <div class="shield-item">
          <div class="shield-light" id="cage-light"></div>
          <div>
            <div class="shield-label">Demir Kafes (Linter)</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);" id="cage-label">76/76 Uyumlu (%100)</div>
          </div>
        </div>
        <div class="shield-item">
          <div class="shield-light"></div>
          <div>
            <div class="shield-label">Ölü Kod Tarayıcı</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);" id="dead-label">0 Unused Export</div>
          </div>
        </div>
        <div class="shield-item">
          <div class="shield-light"></div>
          <div>
            <div class="shield-label">Immutable Oracle</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);" id="trust-label">Trust Score: %100</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent Fleet -->
    <div class="card">
      <div class="card-title">
        <span>Ajan Filosu (Mulgravity Worktrees)</span>
        <span style="color: var(--text-muted);" id="fleet-count">Canlı Oturumlar</span>
      </div>
      <div id="agents-container">
        <div class="agent-box">
          <div>
            <div class="agent-name">🤖 ALICE</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">worktrees/alice | Google Antigravity</div>
          </div>
          <span class="status-badge status-active">ÇALIŞIYOR</span>
        </div>
      </div>
    </div>
  </div>

  <!-- KANBAN BOARD -->
  <div class="card">
    <div class="card-title">
      <span>GitHub Projects Kanban Yansıması</span>
      <span style="font-size: 0.8rem; color: var(--accent);">Çakışmasız Kilit Korumalı</span>
    </div>
    <div class="kanban-board">
      <div class="kanban-col">
        <div class="kanban-col-header">Ready (Hazır)</div>
        <div id="col-ready"></div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header" style="color: var(--accent);">In Progress</div>
        <div id="col-in_progress"></div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header" style="color: var(--yellow);">Blocked (Fren)</div>
        <div id="col-blocked"></div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header">Review</div>
        <div id="col-review"></div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header" style="color: var(--green-glow);">Done (Master Merge)</div>
        <div id="col-done"></div>
      </div>
    </div>
  </div>

  <!-- LIVE EVENT LOG -->
  <div class="card" style="margin-top: 1.5rem;">
    <div class="card-title">
      <span>Canlı Telemetri & Olay Günlüğü</span>
      <span style="font-size: 0.8rem; color: var(--text-muted);">Server-Sent Events (SSE) Aktif</span>
    </div>
    <div class="log-box" id="log-box">
      [Başlangıç] Aegis Live Command Center bağlandı. SSE akışı dinleniyor...
    </div>
  </div>

  <script>
    function renderAgents(agents) {
      const container = document.getElementById('agents-container');
      if (!agents || agents.length === 0) return;
      container.innerHTML = agents.map(a => {
        const badgeClass = a.status === 'locked' ? 'status-active' : (a.status === 'active' ? 'status-active' : 'status-idle');
        const badgeText = a.status === 'locked' ? 'KİLİTLİ' : (a.status === 'active' ? 'ÇALIŞIYOR' : 'BOŞTA');
        const locksNotice = a.lockedFiles && a.lockedFiles.length > 0 ? '<br><small style="color:#d29922">Kilitler: ' + a.lockedFiles.join(', ') + '</small>' : '';
        return '<div class="agent-box" style="margin-bottom:0.5rem;"><div><div class="agent-name">🤖 ' + a.agentName.toUpperCase() + ' <span style="font-size:0.7rem; color:#58a6ff; font-weight:normal;">[' + a.ideType + ']</span></div><div style="font-size:0.75rem; color:var(--text-muted);">' + a.worktreePath + locksNotice + '</div></div><span class="status-badge ' + badgeClass + '">' + badgeText + '</span></div>';
      }).join('');
      document.getElementById('fleet-count').innerText = agents.length + ' Aktif Ajan / Worktree';
    }

    function renderKanban(issues) {
      if (!issues) return;
      const cols = ['ready', 'in_progress', 'blocked', 'review', 'done'];
      cols.forEach(col => {
        const el = document.getElementById('col-' + col);
        if (!el) return;
        const matching = issues.filter(i => i.status === col);
        if (matching.length === 0) {
          el.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top:2rem;">Görev yok</div>';
          return;
        }
        el.innerHTML = matching.map(i => {
          const lockInfo = i.targetFiles && i.targetFiles.length > 0 ? '<br><small style="color:var(--text-muted)">' + i.targetFiles[0] + '</small>' : '';
          const assignee = i.assignedAgent ? '<br><small style="color:#58a6ff;">Atandı: ' + i.assignedAgent.toUpperCase() + ' (' + (i.assignedIde || 'Universal') + ')</small>' : '';
          const actionBtn = col === 'in_progress' ? '<div style="margin-top:0.35rem;"><button class="btn btn-secondary" style="font-size:0.65rem; padding:0.2rem 0.4rem;" onclick="sendAction(\\'complete_task\\', { issueNumber: ' + i.number + ' })">Tamamla (Done) ✓</button></div>' : '';
          return '<div class="kanban-card" style="' + (col === 'in_progress' ? 'border-color:var(--accent);' : (col === 'done' ? 'opacity:0.8;' : '')) + '"><strong>#' + i.number + ' ' + i.title + '</strong>' + lockInfo + assignee + actionBtn + '</div>';
        }).join('');
      });
    }

    function renderMetrics(tm) {
      if (!tm) return;
      document.getElementById('savings-badge').innerText = '%' + tm.savingsPercent + ' Tasarruf';
      document.getElementById('thermo-bar').style.width = tm.savingsPercent + '%';
      document.getElementById('used-tokens').innerText = (tm.usedTokens >= 1000 ? (tm.usedTokens / 1000).toFixed(1) + 'K' : tm.usedTokens);
      document.getElementById('cached-tokens').innerText = (tm.cachedTokens >= 1000 ? (tm.cachedTokens / 1000).toFixed(1) + 'K' : tm.cachedTokens);
    }

    function renderShields(qs) {
      if (!qs) return;
      const lbls = qs.labels || {};
      if (lbls.tdd) document.getElementById('tdd-label').innerText = lbls.tdd;
      if (lbls.ironCage) {
        document.getElementById('cage-label').innerText = lbls.ironCage;
        document.getElementById('cage-light').style.background = qs.ironCage === 'PASS' ? 'var(--green-glow)' : 'var(--red-alert)';
      }
      if (lbls.deadCode) document.getElementById('dead-label').innerText = lbls.deadCode;
      if (lbls.trustVerifier) document.getElementById('trust-label').innerText = lbls.trustVerifier;
    }

    function appendLog(msg) {
      const logBox = document.getElementById('log-box');
      const ts = new Date().toLocaleTimeString();
      logBox.innerHTML += '<br>[' + ts + '] ' + msg;
      logBox.scrollTop = logBox.scrollHeight;
    }

    function updateState(payload) {
      if (payload.agents) renderAgents(payload.agents);
      if (payload.issues) renderKanban(payload.issues);
      if (payload.tokenMetrics) renderMetrics(payload.tokenMetrics);
      if (payload.qualityShields) renderShields(payload.qualityShields);
    }

    function connectSSE() {
      const es = new EventSource('/api/events');
      es.onmessage = e => { try { updateState(JSON.parse(e.data)); } catch(err) {} };
      es.addEventListener('snapshot', e => {
        try {
          const payload = JSON.parse(e.data);
          updateState(payload);
          appendLog('[Aegis SSE] Canlı durum yüklendi: ' + (payload.issues ? payload.issues.length : 0) + ' görev, ' + (payload.agents ? payload.agents.length : 0) + ' ajan.');
        } catch(err) {}
      });
      es.addEventListener('update', e => {
        try {
          const payload = JSON.parse(e.data);
          updateState(payload);
          appendLog('[Aegis SSE] Canlı telemetri güncellendi (' + (payload.activeLocks || 0) + ' aktif kilit).');
        } catch(err) {}
      });
      es.onerror = () => {
        document.getElementById('sse-badge').innerText = '○ YENİDEN BAĞLANIYOR';
        document.getElementById('sse-badge').style.color = '#d29922';
      };
      es.onopen = () => {
        document.getElementById('sse-badge').innerText = '● SSE CANLI';
        document.getElementById('sse-badge').style.color = 'var(--green-glow)';
      };
    }

    async function sendAction(actionName, payload = {}) {
      try {
        appendLog('[İstemci] Aksiyon tetiklendi: ' + actionName);
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: actionName, ...payload })
        });
        const data = await res.json();
        appendLog('[Sunucu] ' + (data.message || JSON.stringify(data)));
      } catch (err) {
        appendLog('[Hata] Aksiyon başarısız: ' + err.message);
      }
    }

    function promptNewTask() {
      const title = prompt('Yeni Görev Başlığı:', 'Yeni Otonom Özellik / Modül');
      if (title && title.trim()) {
        sendAction('create_task', { title: title.trim(), targetFiles: ['packages/core/ast-skeleton/src/index.ts'] });
      }
    }

    window.addEventListener('DOMContentLoaded', connectSSE);
  </script>
</body>
</html>`;
}
