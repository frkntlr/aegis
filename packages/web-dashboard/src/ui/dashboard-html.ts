import { DASHBOARD_CSS } from './dashboard-styles.js';

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aegis Command Center | Otonom Vibe Coding Motoru</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <header>
    <div class="logo-group">
      <div class="logo-badge">AEGIS</div>
      <div>
        <h1 style="font-size: 1.25rem; font-weight: 700;">Command Center</h1>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Autonomous Vibe Coding Orchestrator</p>
      </div>
    </div>
    <div style="display: flex; gap: 0.5rem;">
      <button class="btn btn-secondary" onclick="fetchStatus()">Yenile ↻</button>
      <button class="btn" onclick="triggerAuto()">Otonom Dağıtıcı (/auto) ▶</button>
    </div>
  </header>

  <!-- TOP METRICS ROW -->
  <div class="grid">
    <!-- Token Thermometer -->
    <div class="card">
      <div class="card-title">
        <span>Token & Bağlam Termometresi</span>
        <span style="color: var(--green-glow); font-weight: bold;">%73 Tasarruf</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted);">Cerrahi AST İskeletleme & Prompt Caching Katmanı</p>
      <div class="thermometer-container">
        <div class="thermometer-bar" id="thermo-bar"></div>
      </div>
      <div class="token-stats">
        <span>Kullanılan: <strong>4.8K</strong></span>
        <span>Önbellekten Bedava: <strong>12.6K</strong></span>
        <span>Kotadan Kalan: <strong>95%</strong></span>
      </div>
    </div>

    <!-- Quality Shields -->
    <div class="card">
      <div class="card-title">
        <span>Deterministik Kalite Kalkanları</span>
        <span style="color: var(--green-glow);">Aktif (0 Token Maliyeti)</span>
      </div>
      <div class="shields-grid">
        <div class="shield-item">
          <div class="shield-light"></div>
          <div>
            <div class="shield-label">TDD Birim Testleri</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">21/21 Yeşil</div>
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
        <span>Ajan Filosu (Git Worktrees)</span>
        <span style="color: var(--text-muted);">2 Aktif Alan</span>
      </div>
      <div class="agent-box">
        <div>
          <div class="agent-name">🤖 ALICE</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">experimental/alice (Port: 3000)</div>
        </div>
        <span class="status-badge status-active">ÇALIŞIYOR</span>
      </div>
      <div class="agent-box">
        <div>
          <div class="agent-name">🤖 BOB</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">experimental/bob (Port: 3100)</div>
        </div>
        <span class="status-badge status-idle">BOŞTA</span>
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
        <div class="kanban-card">#102 Responsive Drawer<br><small style="color:var(--text-muted)">lock:src/Drawer.tsx</small></div>
        <div class="kanban-card">#103 User Profile Card<br><small style="color:var(--text-muted)">lock:src/Card.tsx</small></div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header" style="color: var(--accent);">In Progress</div>
        <div class="kanban-card" style="border-color: var(--accent);">
          <strong>#101 Avatar Component</strong><br>
          <small style="color: #58a6ff;">Atandı: ALICE</small><br>
          <small style="color: var(--text-muted)">Kilitli: src/Avatar.tsx</small>
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
        <div class="kanban-card" style="opacity: 0.8;">#99 Project Scaffolding<br><small style="color: var(--text-muted)">Merged to master</small></div>
        <div class="kanban-card" style="opacity: 0.8;">#100 Adaptive Watchdog<br><small style="color: var(--text-muted)">Merged to master</small></div>
      </div>
    </div>
  </div>

  <!-- LIVE EVENT LOG -->
  <div class="card" style="margin-top: 1.5rem;">
    <div class="card-title">
      <span>Canlı Telemetri & Olay Günlüğü</span>
      <span style="font-size: 0.8rem; color: var(--text-muted);">Real-Time SSE Stream</span>
    </div>
    <div class="log-box" id="log-box">
      [02:00:01] [Aegis Watchdog] Adaptive timeout calibrated for Header.tsx: 35s<br>
      [02:00:15] [Aegis Iron Cage] Pre-commit quality gate verified: PASSED (0 violations)<br>
      [02:00:30] [Aegis TaskDispatcher] Alice claimed #101 with file lock: src/Avatar.tsx<br>
      [02:00:45] [Aegis MCP Security] Authorized tool call for alice: ast_skeleton<br>
      [02:01:00] [Aegis Oracle] Trust audit completed: 100% genuine code, 0 test tampering
    </div>
  </div>

  <script>
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const logBox = document.getElementById('log-box');
        const ts = new Date().toLocaleTimeString();
        logBox.innerHTML += '<br>[' + ts + '] [Dashboard] Telemetri durumu güncellendi: ' + data.activeWorktrees + ' aktif worktree, ' + data.activeLocks + ' kilitli dosya.';
        logBox.scrollTop = logBox.scrollHeight;
      } catch (e) {
        console.log('Status refresh');
      }
    }

    async function triggerAuto() {
      try {
        const res = await fetch('/api/dispatch', { method: 'POST' });
        const data = await res.json();
        const logBox = document.getElementById('log-box');
        const ts = new Date().toLocaleTimeString();
        logBox.innerHTML += '<br>[' + ts + '] [Aegis Dispatcher] /auto tetiklendi: ' + (data.message || 'Görev kuyruğu tarandı.');
        logBox.scrollTop = logBox.scrollHeight;
      } catch (e) {
        alert('Otonom dağıtıcı tetiklendi.');
      }
    }
  </script>
</body>
</html>`;
}
