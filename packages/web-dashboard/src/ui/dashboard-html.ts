import { DASHBOARD_CSS } from './dashboard-styles.js';
import { DASHBOARD_JS } from './dashboard-scripts.js';

function renderHeaderSection(): string {
  return `  <header>
    <div class="logo-group">
      <div class="logo-badge">AEGIS</div>
      <div>
        <h1 style="font-size: 1.25rem; font-weight: 700;">Command Center</h1>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Real-Time Mulgravity & Multi-Project Hub</p>
      </div>
    </div>
    <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
      <span id="project-badge" style="font-size: 0.75rem; background: rgba(163,113,247,0.15); color: #d2a8ff; padding: 0.35rem 0.65rem; border-radius: 999px; border: 1px solid rgba(163,113,247,0.3);">📁 Proje: Yükleniyor...</span>
      <select id="project-selector" class="form-control" style="width: auto; height: 30px; font-size: 0.75rem; padding: 0.1rem 0.5rem;" onchange="switchProject(this.value)"></select>
      <span id="sse-badge" style="font-size: 0.75rem; background: rgba(63,185,80,0.15); color: var(--green-glow); padding: 0.35rem 0.65rem; border-radius: 999px; border: 1px solid rgba(63,185,80,0.3);">● SSE CANLI</span>
      <span id="gh-badge" style="font-size: 0.75rem; background: rgba(88,166,255,0.15); color: var(--accent); padding: 0.35rem 0.65rem; border-radius: 999px; border: 1px solid rgba(88,166,255,0.3);">🐙 GitHub</span>
      <span id="branch-badge" style="font-size: 0.75rem; background: rgba(210,153,34,0.15); color: #d29922; padding: 0.35rem 0.65rem; border-radius: 999px; border: 1px solid rgba(210,153,34,0.3);">🌿 master</span>
      <button class="btn btn-secondary" onclick="sendAction('sync_github')" title="GitHub Sync">Sync 🔄</button>
      <button class="btn btn-secondary" onclick="sendAction('sync_toolchain')">Toolchain 🔄</button>
      <button class="btn btn-secondary" onclick="openModal('modal-engines')">Motorlar ⚡</button>
      <button class="btn btn-secondary" onclick="openModal('modal-settings')">Ayarlar ⚙️</button>
      <button class="btn btn-secondary" onclick="openModal('modal-new-task')">Yeni Görev ➕</button>
      <button class="btn btn-secondary" onclick="sendAction('reclaim_orphans')" title="Kurtar">Kurtar 🛡️</button>
      <button class="btn btn-secondary" onclick="sendAction('release_locks')">Kilit Aç 🔓</button>
      <button class="btn" onclick="sendAction('auto')">Otonom (/auto) ▶</button>
    </div>
  </header>`;
}

function renderMetricCardsSection(): string {
  return `  <div class="grid">
    <div class="card">
      <div class="card-title"><span>Token & Bağlam Termometresi</span><span id="savings-badge" style="color: var(--green-glow); font-weight: bold;">%81 Tasarruf</span></div>
      <p style="font-size: 0.85rem; color: var(--text-muted);">Cerrahi AST İskeletleme Katmanı</p>
      <div class="thermometer-container"><div class="thermometer-bar" id="thermo-bar" style="width: 81%;"></div></div>
      <div class="token-stats">
        <span>Kullanılan: <strong id="used-tokens">0</strong></span>
        <span>Önbellekten: <strong id="cached-tokens">0</strong></span>
        <span>Taranan: <strong id="files-scanned">0 Dosya</strong></span>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><span>Deterministik Kalite Kalkanları</span><span style="color: var(--green-glow);">Aktif (0 Token)</span></div>
      <div class="shields-grid">
        <div class="shield-item"><div class="shield-light"></div><div><div class="shield-label">TDD Birim Testleri</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="tdd-label">26/26 Yeşil</div></div></div>
        <div class="shield-item"><div class="shield-light" id="cage-light"></div><div><div class="shield-label">Demir Kafes</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="cage-label">100% Uyumlu</div></div></div>
        <div class="shield-item"><div class="shield-light"></div><div><div class="shield-label">Ölü Kod Tarayıcı</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="dead-label">0 Unused</div></div></div>
        <div class="shield-item"><div class="shield-light"></div><div><div class="shield-label">Immutable Oracle</div><div style="font-size: 0.75rem; color: var(--text-muted);" id="trust-label">Score: %100</div></div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><span>Aktif IDE & Ajan Filosu</span><span style="color: var(--accent);" id="fleet-count">3 Ajan</span></div>
      <div id="agents-list"></div>
    </div>
  </div>`;
}

function renderKanbanSection(): string {
  return `  <div class="kanban-board">
    <div class="kanban-col" id="col-ready" ondragover="onDragOver(event)" ondrop="onDrop(event, 'ready')">
      <div class="col-header"><span class="col-title">📋 Ready (Havuz)</span></div>
      <div class="cards-list"></div>
    </div>
    <div class="kanban-col" id="col-in_progress" ondragover="onDragOver(event)" ondrop="onDrop(event, 'in_progress')">
      <div class="col-header"><span class="col-title">⚡ In Progress</span></div>
      <div class="cards-list"></div>
    </div>
    <div class="kanban-col" id="col-blocked" ondragover="onDragOver(event)" ondrop="onDrop(event, 'blocked')">
      <div class="col-header"><span class="col-title">🛑 Blocked / Triage</span></div>
      <div class="cards-list"></div>
    </div>
    <div class="kanban-col" id="col-review" ondragover="onDragOver(event)" ondrop="onDrop(event, 'review')">
      <div class="col-header"><span class="col-title">🔍 Review & Gate</span></div>
      <div class="cards-list"></div>
    </div>
    <div class="kanban-col" id="col-done" ondragover="onDragOver(event)" ondrop="onDrop(event, 'done')">
      <div class="col-header"><span class="col-title">✅ Done</span></div>
      <div class="cards-list"></div>
    </div>
  </div>`;
}

function renderTerminalSection(): string {
  return `  <div class="card" style="margin-top: 1rem;">
    <div class="card-title"><span>Otonom Telemetri & Canlı Sistem Günlüğü</span><button class="btn btn-secondary btn-sm" onclick="document.getElementById('log-box').innerHTML='Günlük temizlendi.'">Temizle</button></div>
    <div class="terminal-box" id="log-box">[Sistem] Aegis Command Center hazır.</div>
  </div>`;
}

function renderModalsSection(): string {
  return `  <div class="modal" id="modal-new-task">
    <div class="modal-content">
      <div class="modal-header"><h3>Yeni Otonom Görev</h3><button class="btn btn-secondary btn-sm" onclick="closeModal('modal-new-task')">✕</button></div>
      <div class="form-group"><label>Görev Başlığı</label><input type="text" id="task-title" class="form-control" placeholder="Örn: feat(auth): OAuth2 Token Rotation"></div>
      <div class="form-group"><label>Hedef Kilitlenecek Dosyalar (virgülle ayrılmış)</label><input type="text" id="task-files" class="form-control" placeholder="src/auth.ts, src/token.ts"></div>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
        <button class="btn btn-secondary" onclick="closeModal('modal-new-task')">İptal</button>
        <button class="btn" onclick="submitNewTask()">Görev Oluştur</button>
      </div>
    </div>
  </div>

  <div class="modal" id="modal-settings">
    <div class="modal-content">
      <div class="modal-header"><h3>Proje Ayarları</h3><button class="btn btn-secondary btn-sm" onclick="closeModal('modal-settings')">✕</button></div>
      <div class="form-group"><label>Birincil Git Dalı</label><input type="text" id="set-primary-branch" class="form-control" value="master"></div>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
        <button class="btn btn-secondary" onclick="closeModal('modal-settings')">Kapat</button>
        <button class="btn" onclick="saveSettings()">Kaydet</button>
      </div>
    </div>
  </div>

  <div class="modal" id="modal-engines">
    <div class="modal-content">
      <div class="modal-header"><h3>Aegis Çekirdek Araç & Kalite Motorları</h3><button class="btn btn-secondary btn-sm" onclick="closeModal('modal-engines')">✕</button></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
        <button class="btn btn-secondary" onclick="runEngineTool('ui_inspector')">UI Inspector</button>
        <button class="btn btn-secondary" onclick="runEngineTool('mutation_gate')">Mutation Gate</button>
        <button class="btn btn-secondary" onclick="runEngineTool('diff_validator')">Diff Validator</button>
        <button class="btn btn-secondary" onclick="runEngineTool('oracle_audit')">Immutable Oracle</button>
      </div>
      <pre id="engine-output" style="background:#0d1117; padding:0.5rem; border-radius:6px; font-size:0.75rem; max-height:200px; overflow:auto; margin-top:0.75rem;"></pre>
    </div>
  </div>`;
}

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
${renderHeaderSection()}
${renderMetricCardsSection()}
${renderKanbanSection()}
${renderTerminalSection()}
${renderModalsSection()}
  <script>${DASHBOARD_JS}</script>
</body>
</html>`;
}
