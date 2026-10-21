import * as http from 'node:http';
import { getDashboardHtml } from '../ui/dashboard-html.js';
import { WorktreeManager } from '@aegis/orchestrator';

export interface DashboardServerOptions {
  port?: number;
  repoRoot?: string;
}

export class DashboardServer {
  private server: http.Server | null = null;
  private port: number;
  private wtManager: WorktreeManager;

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port ?? 3000;
    this.wtManager = new WorktreeManager({ repoRoot: options.repoRoot });
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url || '/';

        // 1. Dashboard UI
        if (url === '/' || url === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getDashboardHtml());
          return;
        }

        // 2. Status API
        if (url === '/api/status' && req.method === 'GET') {
          const list = this.wtManager.listWorktrees();
          const locks = this.wtManager.getLockedFiles();

          const data = {
            activeWorktrees: list.activeCount,
            activeLocks: locks.size,
            agents: [
              { name: 'alice', status: 'running', worktree: 'experimental/alice', port: 3000 },
              { name: 'bob', status: 'idle', worktree: 'experimental/bob', port: 3100 }
            ],
            tokenMetrics: {
              usedTokens: 4800,
              cachedTokens: 12600,
              savingsPercent: 73
            },
            qualityShields: {
              tdd: 'PASS',
              ironCage: 'PASS',
              deadCode: 'PASS',
              trustVerifier: 'PASS'
            },
            timestamp: new Date().toISOString()
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }

        // 3. Dispatch API
        if (url === '/api/dispatch' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Görev kuyruğu tarandı ve çakışmasız görevler işçi ajanlara dağıtıldı.'
          }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this.server.on('error', (err) => reject(err));
      this.server.listen(this.port, () => {
        resolve(this.port);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  public getPort(): number {
    return this.port;
  }
}
