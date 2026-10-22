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
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      <span id="sse-badge" style="font-size: 0.75rem; background: rgba(63,185,80,0.15); color: var(--green-glow); padding: 0.35rem 0.75rem; border-radius: 999px; border: 1px solid rgba(63,185,80,0.3);">● SSE CANLI</span>
      <button class="btn btn-secondary" onclick="sendAction('release_locks')">Kilitleri Boşalt 🔓</button>
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
        <span>Kotadan Kalan: <strong>95%</strong></span>
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
          <div class="shield-light"></div>
          <div>
            <div class="shield-label">Demir Kafes (Linter)</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">&lt; 40 Satır / CC &lt; 10</div>
          </div>
        </div>
        <div class="shield-item">
          <div class="shield-light"></div>
          <div>
            <div class="shield-label">Ölü Kod Tarayıcı</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">0 Unused Export</div>
          </div>
        </div>
        <div class="shield-item">
          <div class="shield-light"></div>
          <div>
            <div class="shield-label">Immutable Oracle</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Trust Score: %100</div>
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
            <div style="font-size: 0.75rem; color: var(--text-muted);">experimental/alice | Google Antigravity</div>
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
        <div class="kanban-card">#101 Multi-Editor Live Stream<br><small style="color:var(--text-muted)">lock:packages/web-dashboard/src/server/dashboard-server.ts</small></div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header" style="color: var(--accent);">In Progress</div>
        <div class="kanban-card" style="border-color: var(--accent);">
          <strong>#101 Live SSE Stream</strong><br>
          <small style="color: #58a6ff;">Atandı: ALICE (Google Antigravity)</small>
        </div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header" style="color: var(--yellow);">Blocked (Fren)</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin-top: 2rem;">Tıkanan görev yok</div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header">Review</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin-top: 2rem;">Bekleyen yok</div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header" style="color: var(--green-glow);">Done (Master Merge)</div>
        <div class="kanban-card" style="opacity: 0.8;">#100 Adaptive Watchdog<br><small style="color: var(--text-muted)">Merged to master</small></div>
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
    function renderAgents(agents, lockedFiles) {
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

    function appendLog(msg) {
      const logBox = document.getElementById('log-box');
      const ts = new Date().toLocaleTimeString();
      logBox.innerHTML += '<br>[' + ts + '] ' + msg;
      logBox.scrollTop = logBox.scrollHeight;
    }

    function connectSSE() {
      const es = new EventSource('/api/events');
      es.onmessage = function(e) {
        try {
          const payload = JSON.parse(e.data);
          if (payload.agents) renderAgents(payload.agents, payload.lockedFiles);
          appendLog('[Aegis Telemetri] Güncelleme alındı (' + (payload.activeLocks || 0) + ' kilitli dosya)');
        } catch(err) {}
      };
      es.addEventListener('snapshot', function(e) {
        const payload = JSON.parse(e.data);
        if (payload.agents) renderAgents(payload.agents, payload.lockedFiles);
        appendLog('[Aegis SSE] Canlı durum anlık görüntüsü yüklendi.');
      });
      es.addEventListener('update', function(e) {
        const payload = JSON.parse(e.data);
        if (payload.agents) renderAgents(payload.agents, payload.lockedFiles);
        appendLog('[Aegis SSE] Dinamik eylem sonrası telemetri tazelendi.');
      });
      es.onerror = function() {
        document.getElementById('sse-badge').innerText = '○ YENİDEN BAĞLANIYOR';
        document.getElementById('sse-badge').style.color = '#d29922';
      };
      es.onopen = function() {
        document.getElementById('sse-badge').innerText = '● SSE CANLI';
        document.getElementById('sse-badge').style.color = 'var(--green-glow)';
      };
    }

    async function sendAction(actionName) {
      try {
        appendLog('[İstemci] Aksiyon gönderiliyor: ' + actionName);
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: actionName })
        });
        const data = await res.json();
        appendLog('[Sunucu Yanıtı] ' + (data.message || JSON.stringify(data)));
      } catch (err) {
        appendLog('[Hata] Aksiyon başarısız: ' + err.message);
      }
    }

    window.addEventListener('DOMContentLoaded', connectSSE);
  </script>
</body>
</html>`;
}
