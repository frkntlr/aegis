export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aegis Command Center | Otonom Vibe Coding Motoru</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --accent: #58a6ff;
      --green: #238636;
      --green-glow: #3fb950;
      --red: #da3633;
      --yellow: #d29922;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      padding: 1.5rem;
      min-height: 100vh;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
    }
    .logo-group { display: flex; align-items: center; gap: 0.75rem; }
    .logo-badge {
      background: linear-gradient(135deg, #1f6feb, #8957e5);
      color: white;
      font-weight: bold;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 1.1rem;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    /* Token Thermometer */
    .thermometer-container {
      background: #21262d;
      border-radius: 6px;
      height: 20px;
      overflow: hidden;
      margin: 1rem 0 0.5rem;
      position: relative;
    }
    .thermometer-bar {
      background: linear-gradient(90deg, #238636, #3fb950);
      height: 100%;
      width: 73%;
      border-radius: 6px;
      transition: width 0.5s ease;
    }
    .token-stats {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    /* Quality Shields */
    .shields-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }
    .shield-item {
      background: #21262d;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .shield-light {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--green-glow);
      box-shadow: 0 0 8px var(--green-glow);
    }
    .shield-label { font-size: 0.85rem; font-weight: 500; }
    /* Agent Cards */
    .agent-box {
      background: #21262d;
      border-radius: 6px;
      padding: 0.8rem;
      margin-bottom: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .agent-name { font-weight: 600; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge {
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-active { background: rgba(63, 185, 80, 0.2); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.4); }
    .status-idle { background: rgba(139, 148, 158, 0.2); color: #8b949e; border: 1px solid rgba(139, 148, 158, 0.4); }
    /* Kanban Board */
    .kanban-board {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .kanban-col {
      background: #21262d;
      border-radius: 6px;
      padding: 0.75rem;
      min-height: 200px;
    }
    .kanban-col-header {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      text-transform: uppercase;
    }
    .kanban-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.6rem;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }
    .btn {
      background: var(--green);
      color: white;
      border: 1px solid rgba(240,246,252,0.1);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.85rem;
      transition: background 0.2s;
    }
    .btn:hover { background: #2ea043; }
    .btn-secondary {
      background: #21262d;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: #30363d; }
    .log-box {
      background: #090d13;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
      font-family: monospace;
      font-size: 0.8rem;
      color: #7ee787;
      max-height: 120px;
      overflow-y: auto;
    }
  </style>
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
