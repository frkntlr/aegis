import * as http from 'node:http';

export function notifyDashboardFocus(workspacePath: string = process.cwd()): void {
  try {
    const postData = JSON.stringify({ workspacePath });
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/projects/focus',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 300
    });
    req.on('error', () => { /* no-op */ });
    req.on('timeout', () => { req.destroy(); });
    req.write(postData);
    req.end();
  } catch {
    // Non-blocking fire-and-forget
  }
}
