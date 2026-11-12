import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorktreeMutex } from './worktree-mutex.js';
import { requireIdentifier, validateStoredRun } from './codex-orchestra-validation.js';
import type { OrchestraRun } from './codex-orchestra-types.js';

export class OrchestraStore {
  constructor(private readonly root: string) {}

  private file(id: string): string {
    requireIdentifier(id);
    return path.resolve(this.root, '.aegis/codex-orchestra', `${id}.json`);
  }

  public read(id: string): OrchestraRun {
    const value: unknown = JSON.parse(fs.readFileSync(this.file(id), 'utf8'));
    validateStoredRun(value, id, this.root);
    return value;
  }

  public change<T>(id: string, mutate: (run: OrchestraRun) => T): T {
    const unlock = WorktreeMutex.acquire(this.file(id));
    try {
      const run = this.read(id);
      const result = mutate(run);
      run.updatedAt = new Date().toISOString();
      this.write(run);
      return result;
    } finally { unlock(); }
  }

  public create(run: OrchestraRun): void {
    const unlock = WorktreeMutex.acquire(this.file(run.id));
    try {
      if (fs.existsSync(this.file(run.id))) throw new Error('Orchestra run already exists');
      this.write(run);
    } finally { unlock(); }
  }

  private write(run: OrchestraRun): void {
    const file = this.file(run.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(run, null, 2), 'utf8');
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}
