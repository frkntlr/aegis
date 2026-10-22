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
    <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
      <span id="sse-badge" style="font-size: 0.75rem; background: rgba(63,185,80,0.15); color: var(--green-glow); padding: 0.35rem 0.65rem; border-radius: 999px; border: 1px solid rgba(63,185,80,0.3);">● SSE CANLI</span>
      <button class="btn btn-secondary" onclick="sendAction('sync_toolchain')">Toolchain Eşitle 🔄</button>
      <button class="btn btn-secondary" onclick="openModal('modal-engines')">Aegis Motorları ⚡</button>
      <button class="btn btn-secondary" onclick="openModal('modal-settings')">Ayarlar ⚙️</button>
      <button class="btn btn-secondary" onclick="openModal('modal-new-task')">Yeni Görev ➕</button>
      <button class="btn btn-secondary" onclick="sendAction('release_locks')">Kilitleri Aç 🔓</button>
      <button class="btn" onclick="sendAction('auto')">Otonom Dağıtıcı (/auto) ▶</button>
    </div>
  </header>

  <!-- TOP METRICS ROW -->
  <div class="grid">
    <div class="card">
      <div class="card-title"><span>Token & Bağlam Termometresi</span><span id="savings-badge" style="color: var(--green-glow); font-weight: bold;">%81 Tasarruf</span></div>
      <p style="font-size: 0.85rem; color: var(--text-muted);">Cerrahi AST İskeletleme & Prompt Caching Katmanı</p>
      <div class="thermometer-container"><div class="thermometer-bar" id="thermo-bar" style="width: 81%;"></div></div>
      <div class="token-stats">
        <span>Kullanılan: <strong id="used-tokens">9.6K</strong></span>
        <span>Önbellekten Bedava: <strong id="cached-tokens">42.1K</strong></span>
        <span>Taranan: <strong id="files-scanned">77 Dosya</strong></span>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span>Deterministik Kalite Kalkanları</span><span style="color: var(--green-glow);">Aktif (0 Token)</span></div>
      <div class="shields-grid">
        <div class="shield-item"><div class="shield-light"></div><div><div class="shield-label">TDD Birim Testleri</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="tdd-label">24/24 Yeşil</div></div></div>
        <div class="shield-item"><div class="shield-light" id="cage-light"></div><div><div class="shield-label">Demir Kafes (Linter)</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="cage-label">77/77 Uyumlu (%100)</div></div></div>
        <div class="shield-item"><div class="shield-light"></div><div><div class="shield-label">Ölü Kod Tarayıcı</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="dead-label">0 Unused Export</div></div></div>
        <div class="shield-item"><div class="shield-light"></div><div><div class="shield-label">Immutable Oracle</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="trust-label">Trust Score: %100</div></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span>Ajan Filosu & IDE Oturumları</span><span style="color: var(--text-muted);" id="fleet-count">Canlı Oturumlar</span></div>
      <div id="agents-container"></div>
    </div>
  </div>

  <!-- KANBAN BOARD (DRAG & DROP) -->
  <div class="card">
    <div class="card-title">
      <span>GitHub Projects Kanban Yansıması (Sürükle-Bırak)</span>
      <span style="font-size: 0.8rem; color: var(--accent);">Çakışmasız Kilit Korumalı</span>
    </div>
    <div class="kanban-board">
      <div class="kanban-col" id="col-ready" ondragover="allowDrop(event)" ondragleave="dropLeave(event)" ondrop="handleDrop(event, 'ready')"><div class="kanban-col-header">Ready (Hazır)</div><div class="cards-list"></div></div>
      <div class="kanban-col" id="col-in_progress" ondragover="allowDrop(event)" ondragleave="dropLeave(event)" ondrop="handleDrop(event, 'in_progress')"><div class="kanban-col-header" style="color: var(--accent);">In Progress</div><div class="cards-list"></div></div>
      <div class="kanban-col" id="col-blocked" ondragover="allowDrop(event)" ondragleave="dropLeave(event)" ondrop="handleDrop(event, 'blocked')"><div class="kanban-col-header" style="color: var(--yellow);">Blocked (Fren)</div><div class="cards-list"></div></div>
      <div class="kanban-col" id="col-review" ondragover="allowDrop(event)" ondragleave="dropLeave(event)" ondrop="handleDrop(event, 'review')"><div class="kanban-col-header">Review</div><div class="cards-list"></div></div>
      <div class="kanban-col" id="col-done" ondragover="allowDrop(event)" ondragleave="dropLeave(event)" ondrop="handleDrop(event, 'done')"><div class="kanban-col-header" style="color: var(--green-glow);">Done (Master Merge)</div><div class="cards-list"></div></div>
    </div>
  </div>

  <!-- LIVE EVENT LOG -->
  <div class="card" style="margin-top: 1.5rem;">
    <div class="card-title"><span>Canlı Telemetri & Olay Günlüğü</span><span style="font-size: 0.8rem; color: var(--text-muted);">Server-Sent Events (SSE) Aktif</span></div>
    <div class="log-box" id="log-box">[Başlangıç] Aegis Live Command Center bağlandı. SSE akışı dinleniyor...</div>
  </div>

  <!-- MODALS -->
  <div id="modal-new-task" class="modal-backdrop">
    <div class="modal-dialog">
      <h3 style="margin-bottom: 1rem;">➕ Yeni Görev Oluştur & IDE'ye Aktar</h3>
      <label>Görev Başlığı:</label><input id="task-title" class="form-control" placeholder="Örn: Implement Rust Token Optimizer" />
      <label>Hedef Dosyalar (Virgülle ayırın):</label><input id="task-files" class="form-control" placeholder="packages/core/ast-skeleton/src/rust-extractor.ts" />
      <label>Hedef Ajan:</label><select id="task-agent" class="form-control"><option value="alice">Alice (worktrees/alice)</option><option value="bob">Bob (worktrees/bob)</option><option value="contributor">Contributor</option></select>
      <label>Hedef IDE:</label><select id="task-ide" class="form-control"><option value="Google Antigravity">Google Antigravity</option><option value="Cursor AI">Cursor AI</option><option value="VS Code">VS Code</option></select>
      <label><input type="checkbox" id="task-launch" checked /> Görevi oluştururken IDE'yi otomatik başlat/aç</label>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
        <button class="btn btn-secondary" onclick="closeModal('modal-new-task')">İptal</button>
        <button class="btn" onclick="submitNewTask()">Görevi Başlat 🚀</button>
      </div>
    </div>
  </div>

  <div id="modal-engines" class="modal-backdrop">
    <div class="modal-dialog">
      <h3 style="margin-bottom: 1rem;">⚡ Aegis Derin Motor Konsolu</h3>
      <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-sm" onclick="runEngineTool('ui_inspector')">📐 UI Layout (0 Token)</button>
        <button class="btn btn-secondary btn-sm" onclick="runEngineTool('mutation_gate')">🧪 Mutasyon Kapısı (%70)</button>
        <button class="btn btn-secondary btn-sm" onclick="runEngineTool('adaptive_timeout')">🧠 Adaptif Timeout</button>
        <button class="btn btn-secondary btn-sm" onclick="runEngineTool('mcp_security')">🛡️ MCP RBAC Güvenlik</button>
        <button class="btn btn-secondary btn-sm" onclick="runEngineTool('diff_validator')">🔍 Cerrahi Diff</button>
        <button class="btn btn-secondary btn-sm" onclick="runEngineTool('immutable_oracle')">🔒 Immutable Oracle</button>
      </div>
      <div id="engine-output" class="tool-result">Aegis alt motor çıktısı burada görüntülenecektir...</div>
      <div style="display: flex; justify-content: flex-end; margin-top: 1rem;"><button class="btn btn-secondary" onclick="closeModal('modal-engines')">Kapat</button></div>
    </div>
  </div>

  <div id="modal-settings" class="modal-backdrop">
    <div class="modal-dialog">
      <h3 style="margin-bottom: 1rem;">⚙️ Aegis Genel Ayarları</h3>
      <label>Demir Kafes Maksimum Fonksiyon Satırı:</label><input id="set-func-lines" class="form-control" type="number" value="40" />
      <label>Demir Kafes Maksimum Dosya Satırı:</label><input id="set-file-lines" class="form-control" type="number" value="300" />
      <label>Adaptif Timeout Maksimum Tavan (Saniye):</label><input id="set-timeout" class="form-control" type="number" value="180" />
      <label>Varsayılan IDE:</label><select id="set-ide" class="form-control"><option value="Google Antigravity">Google Antigravity</option><option value="Cursor AI">Cursor AI</option><option value="VS Code">VS Code</option></select>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
        <button class="btn btn-secondary" onclick="closeModal('modal-settings')">İptal</button>
        <button class="btn" onclick="saveSettings()">Kaydet</button>
      </div>
    </div>
  </div>

  <script>
    let draggedIssueNum = null;
    function openModal(id) { document.getElementById(id).style.display = 'flex'; }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }
    function onDragStart(e, num) { draggedIssueNum = num; e.dataTransfer.setData('text/plain', num); }
    function allowDrop(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
    function dropLeave(e) { e.currentTarget.classList.remove('drag-over'); }
    function handleDrop(e, status) {
      e.preventDefault(); e.currentTarget.classList.remove('drag-over');
      if (draggedIssueNum) { sendAction('move_task', { issueNumber: draggedIssueNum, targetStatus: status }); draggedIssueNum = null; }
    }

    function renderAgents(agents) {
      const container = document.getElementById('agents-container');
      if (!agents || agents.length === 0) return;
      container.innerHTML = agents.map(a => {
        const badge = a.status === 'locked' ? 'status-active' : (a.status === 'active' ? 'status-active' : 'status-idle');
        const badgeTxt = a.status === 'locked' ? 'KİLİTLİ' : (a.status === 'active' ? 'ÇALIŞIYOR' : 'BOŞTA');
        const locks = a.lockedFiles?.length ? '<br><small style="color:#d29922">Kilit: ' + a.lockedFiles[0] + '</small>' : '';
        const ideBtn = '<button class="btn btn-secondary btn-sm" style="margin-left:auto;" onclick="sendAction(\\'launch_ide\\', { ideType: \\'' + a.ideType + '\\', worktreePath: \\'' + a.worktreePath + '\\' })">İdeyi Aç ↗</button>';
        return '<div class="agent-box"><div><div class="agent-name">🤖 ' + a.agentName.toUpperCase() + ' <span style="font-size:0.75rem; color:var(--accent);">[' + a.ideType + ']</span></div><div style="font-size:0.75rem; color:var(--text-muted);">' + a.worktreePath + locks + '</div></div>' + ideBtn + '<span class="status-badge ' + badge + '" style="margin-left:0.5rem;">' + badgeTxt + '</span></div>';
      }).join('');
      document.getElementById('fleet-count').innerText = agents.length + ' Aktif Ajan / Worktree';
    }

    function renderKanban(issues) {
      if (!issues) return;
      ['ready', 'in_progress', 'blocked', 'review', 'done'].forEach(col => {
        const listEl = document.querySelector('#col-' + col + ' .cards-list');
        if (!listEl) return;
        const matching = issues.filter(i => i.status === col);
        if (matching.length === 0) { listEl.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top:2rem;">Görev yok</div>'; return; }
        listEl.innerHTML = matching.map(i => {
          const files = i.targetFiles?.length ? '<br><small style="color:var(--text-muted);">' + i.targetFiles[0] + '</small>' : '';
          const assignee = i.assignedAgent ? '<br><small style="color:var(--accent);">Atandı: ' + i.assignedAgent.toUpperCase() + ' (' + (i.assignedIde || 'Universal') + ')</small>' : '';
          const ghLink = '<br><a href="https://github.com/frkntlr/aegis/issues/' + i.number + '" target="_blank" class="gh-link">GitHub #' + i.number + ' ↗</a>';
          const act = col === 'in_progress' ? '<div style="margin-top:0.35rem;"><button class="btn btn-secondary btn-sm" onclick="sendAction(\\'move_task\\', { issueNumber: ' + i.number + ', targetStatus: \\'done\\' })">Tamamla ✓</button></div>' : '';
          return '<div class="kanban-card" draggable="true" ondragstart="onDragStart(event, ' + i.number + ')" style="' + (col === 'in_progress' ? 'border-color:var(--accent);' : '') + '"><strong>#' + i.number + ' ' + i.title + '</strong>' + files + assignee + ghLink + act + '</div>';
        }).join('');
      });
    }

    function renderMetrics(tm) {
      if (!tm) return;
      document.getElementById('savings-badge').innerText = '%' + tm.savingsPercent + ' Tasarruf';
      document.getElementById('thermo-bar').style.width = tm.savingsPercent + '%';
      document.getElementById('used-tokens').innerText = (tm.usedTokens >= 1000 ? (tm.usedTokens / 1000).toFixed(1) + 'K' : tm.usedTokens);
      document.getElementById('cached-tokens').innerText = (tm.cachedTokens >= 1000 ? (tm.cachedTokens / 1000).toFixed(1) + 'K' : tm.cachedTokens);
      if (tm.filesScanned) document.getElementById('files-scanned').innerText = tm.filesScanned + ' Dosya';
    }

    function renderShields(qs) {
      if (!qs) return;
      const l = qs.labels || {};
      if (l.tdd) document.getElementById('tdd-label').innerText = l.tdd;
      if (l.ironCage) { document.getElementById('cage-label').innerText = l.ironCage; document.getElementById('cage-light').style.background = qs.ironCage === 'PASS' ? 'var(--green-glow)' : 'var(--red-alert)'; }
      if (l.deadCode) document.getElementById('dead-label').innerText = l.deadCode;
      if (l.trustVerifier) document.getElementById('trust-label').innerText = l.trustVerifier;
    }

    function appendLog(msg) {
      const b = document.getElementById('log-box');
      b.innerHTML += '<br>[' + new Date().toLocaleTimeString() + '] ' + msg;
      b.scrollTop = b.scrollHeight;
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
      es.addEventListener('snapshot', e => { try { const p = JSON.parse(e.data); updateState(p); appendLog('[Aegis SSE] Canlı durum yüklendi: ' + (p.issues?.length || 0) + ' görev, ' + (p.agents?.length || 0) + ' ajan.'); } catch(err) {} });
      es.addEventListener('update', e => { try { const p = JSON.parse(e.data); updateState(p); appendLog('[Aegis SSE] Telemetri tazelendi (' + (p.activeLocks || 0) + ' aktif kilit).'); } catch(err) {} });
      es.onerror = () => { document.getElementById('sse-badge').innerText = '○ YENİDEN BAĞLANIYOR'; document.getElementById('sse-badge').style.color = '#d29922'; };
      es.onopen = () => { document.getElementById('sse-badge').innerText = '● SSE CANLI'; document.getElementById('sse-badge').style.color = 'var(--green-glow)'; };
    }

    async function sendAction(actionName, payload = {}) {
      try {
        appendLog('[İstemci] Aksiyon: ' + actionName);
        const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: actionName, ...payload }) });
        const d = await res.json();
        appendLog('[Sunucu] ' + (d.message || JSON.stringify(d)));
        return d;
      } catch (err) { appendLog('[Hata] Aksiyon başarısız: ' + err.message); }
    }

    async function runEngineTool(toolName) {
      const d = await sendAction('run_engine_tool', { tool: toolName });
      if (d && d.result) { document.getElementById('engine-output').innerText = JSON.stringify(d.result, null, 2); }
    }

    function submitNewTask() {
      const title = document.getElementById('task-title').value;
      const files = document.getElementById('task-files').value.split(',').map(s => s.trim()).filter(Boolean);
      const agent = document.getElementById('task-agent').value;
      const ide = document.getElementById('task-ide').value;
      const launch = document.getElementById('task-launch').checked;
      if (!title) return alert('Lütfen görev başlığı girin.');
      sendAction('create_task', { title, targetFiles: files, agentName: agent, ideType: ide, launchIde: launch });
      closeModal('modal-new-task');
    }

    function saveSettings() {
      const s = {
        maxFunctionLines: parseInt(document.getElementById('set-func-lines').value, 10),
        maxFileLines: parseInt(document.getElementById('set-file-lines').value, 10),
        timeoutCeiling: parseInt(document.getElementById('set-timeout').value, 10),
        preferredIde: document.getElementById('set-ide').value
      };
      sendAction('save_settings', { settings: s });
      closeModal('modal-settings');
    }

    window.addEventListener('DOMContentLoaded', connectSSE);
  </script>
</body>
</html>`;
}
