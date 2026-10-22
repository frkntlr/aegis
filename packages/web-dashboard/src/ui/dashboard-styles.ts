export const DASHBOARD_CSS = `
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
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
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
  .agent-box {
    background: #21262d;
    border-radius: 6px;
    padding: 0.8rem;
    margin-bottom: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .agent-name { font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; }
  .status-badge {
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .status-active { background: rgba(63, 185, 80, 0.2); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.4); }
  .status-idle { background: rgba(139, 148, 158, 0.2); color: #8b949e; border: 1px solid rgba(139, 148, 158, 0.4); }
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
    min-height: 220px;
    transition: background 0.2s, border-color 0.2s;
  }
  .kanban-col.drag-over {
    background: #2a323d;
    outline: 2px dashed var(--accent);
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
    padding: 0.7rem;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
    cursor: grab;
    user-select: none;
    transition: transform 0.15s, border-color 0.15s;
  }
  .kanban-card:active { cursor: grabbing; opacity: 0.75; transform: scale(0.98); }
  .gh-link { color: var(--accent); text-decoration: none; font-size: 0.75rem; }
  .gh-link:hover { text-decoration: underline; }
  .btn {
    background: var(--green);
    color: white;
    border: 1px solid rgba(240,246,252,0.1);
    padding: 0.45rem 0.9rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background 0.2s;
  }
  .btn:hover { background: #2ea043; }
  .btn-secondary {
    background: #21262d;
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { background: #30363d; }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.7rem; }
  .log-box {
    background: #090d13;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    font-family: monospace;
    font-size: 0.8rem;
    height: 130px;
    overflow-y: auto;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }
  .modal-dialog {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    max-width: 620px;
    width: 90%;
    padding: 1.5rem;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }
  .form-control {
    width: 100%;
    background: #090d13;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 0.55rem;
    margin-top: 0.35rem;
    margin-bottom: 0.85rem;
    font-family: var(--font);
    font-size: 0.85rem;
  }
  .tool-result {
    background: #090d13;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    margin-top: 0.75rem;
    font-family: monospace;
    font-size: 0.8rem;
    white-space: pre-wrap;
    max-height: 180px;
    overflow-y: auto;
  }
`;
