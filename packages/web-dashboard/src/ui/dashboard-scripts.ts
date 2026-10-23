export const DASHBOARD_JS = `
    function openModal(id) { document.getElementById(id).classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }
    function onDragStart(e, num) { e.dataTransfer.setData('text/plain', num); }
    function onDragOver(e) { e.preventDefault(); }
    function onDrop(e, status) {
      e.preventDefault();
      const num = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (num) sendAction('move_task', { issueNumber: num, targetStatus: status });
    }
    const handleDrop = onDrop;

    function renderProjectSelector(projects, active) {
      const sel = document.getElementById('project-selector');
      if (!sel || !projects) return;
      sel.innerHTML = projects.map(p => {
        const isSel = p.id === active?.id ? ' selected' : '';
        const icon = p.isLocalBound ? '💻 ' : '☁️ ';
        return '<option value="' + p.id + '"' + isSel + '>' + icon + p.name + '</option>';
      }).join('');
      const badge = document.getElementById('project-badge');
      if (badge && active) badge.innerText = '📁 ' + active.name;
    }

    async function switchProject(id) {
      await sendAction('switch_project', { projectId: id });
      fetchStatus();
    }

    function renderAgents(agents) {
      const el = document.getElementById('agents-list');
      if (!el || !agents) return;
      el.innerHTML = agents.map(a => {
        const badge = a.status === 'locked' ? 'status-active' : (a.status === 'active' ? 'status-active' : 'status-idle');
        const badgeTxt = a.status === 'locked' ? 'KİLİTLİ' : (a.status === 'active' ? 'ÇALIŞIYOR' : 'BOŞTA');
        const locks = a.lockedFiles?.length ? '<br><small style="color:#d29922">Kilit: ' + a.lockedFiles[0] + '</small>' : '';
        return '<div class="agent-box"><div><div class="agent-name">🤖 ' + a.agentName.toUpperCase() + ' <span style="font-size:0.75rem; color:var(--accent);">[' + a.ideType + ']</span></div><div style="font-size:0.75rem; color:var(--text-muted);">' + a.worktreePath + locks + '</div></div><span class="status-badge ' + badge + '" style="margin-left:auto;">' + badgeTxt + '</span></div>';
      }).join('');
      document.getElementById('fleet-count').innerText = agents.length + ' Aktif Ajan';
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
          const act = col === 'in_progress' ? '<div style="margin-top:0.35rem;"><button class="btn btn-secondary btn-sm" onclick="sendAction(\\'move_task\\', { issueNumber: ' + i.number + ', targetStatus: \\'done\\' })">Tamamla ✓</button></div>' : '';
          return '<div class="kanban-card" draggable="true" ondragstart="onDragStart(event, ' + i.number + ')" style="' + (col === 'in_progress' ? 'border-color:var(--accent);' : '') + '"><strong>#' + i.number + ' ' + i.title + '</strong>' + files + act + '</div>';
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
      if (!b) return;
      b.innerHTML += '<br>[' + new Date().toLocaleTimeString() + '] ' + msg;
      b.scrollTop = b.scrollHeight;
    }

    function updateState(payload) {
      if (payload.projects) renderProjectSelector(payload.projects, payload.activeProject);
      if (payload.agents) renderAgents(payload.agents);
      if (payload.issues) renderKanban(payload.issues);
      if (payload.tokenMetrics) renderMetrics(payload.tokenMetrics);
      if (payload.qualityShields) renderShields(payload.qualityShields);
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        updateState(data);
      } catch {}
    }

    function connectSSE() {
      const es = new EventSource('/api/events');
      es.onmessage = e => { try { updateState(JSON.parse(e.data)); } catch(err) {} };
      es.addEventListener('snapshot', e => { try { updateState(JSON.parse(e.data)); } catch(err) {} });
      es.addEventListener('update', e => { try { updateState(JSON.parse(e.data)); } catch(err) {} });
      es.addEventListener('context_switched', e => {
        try {
          const p = JSON.parse(e.data);
          appendLog('[Auto-Follow IDE] Proje değişti: ' + (p.activeProject?.name || ''));
          fetchStatus();
        } catch(err) {}
      });
      es.onerror = () => { document.getElementById('sse-badge').innerText = '○ YENİDEN BAĞLANIYOR'; document.getElementById('sse-badge').style.color = '#d29922'; };
      es.onopen = () => { document.getElementById('sse-badge').innerText = '● SSE CANLI'; document.getElementById('sse-badge').style.color = 'var(--green-glow)'; };
    }

    async function sendAction(actionName, payload = {}) {
      try {
        appendLog('[İstemci] ' + actionName);
        const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: actionName, ...payload }) });
        const d = await res.json();
        appendLog('[Sunucu] ' + (d.message || 'Tamamlandı'));
        return d;
      } catch (err) { appendLog('[Hata] ' + err.message); }
    }

    async function runEngineTool(toolName) {
      const d = await sendAction('run_engine_tool', { tool: toolName });
      if (d && d.result) document.getElementById('engine-output').innerText = JSON.stringify(d.result, null, 2);
    }

    function submitNewTask() {
      const title = document.getElementById('task-title').value;
      const files = document.getElementById('task-files').value.split(',').map(s => s.trim()).filter(Boolean);
      if (!title) return alert('Lütfen başlık girin.');
      sendAction('create_task', { title, targetFiles: files });
      closeModal('modal-new-task');
    }

    function saveSettings() {
      const branch = document.getElementById('set-primary-branch').value;
      sendAction('save_settings', { primaryBranch: branch });
      closeModal('modal-settings');
    }

    window.onload = () => { connectSSE(); fetchStatus(); };
`;
