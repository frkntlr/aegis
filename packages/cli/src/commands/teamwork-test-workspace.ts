import { before, after } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Keep command handlers that resolve their own workspace out of the real repo. */
export function isolateTeamworkTestWorkspace(name: string): void {
  const previousWorkspace = process.env.AEGIS_WORKSPACE;
  let workspace: string;
  before(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), `aegis-${name}-test-`));
    process.env.AEGIS_WORKSPACE = workspace;
  });
  after(() => {
    if (previousWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = previousWorkspace;
    fs.rmSync(workspace, { recursive: true, force: true });
  });
}
