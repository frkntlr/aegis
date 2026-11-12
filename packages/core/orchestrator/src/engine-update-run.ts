import type { EngineUpdater, EngineUpdateOptions, EngineUpdateResult } from './engine-updater.js';
import { VersionManager } from './version-manager.js';
import { resolveUpdateEngineRoot } from './engine-update-refresh.js';

export function runEngineUpdate(updater: typeof EngineUpdater, options: EngineUpdateOptions): EngineUpdateResult {
  const start = Date.now();
  const result: EngineUpdateResult = { success: false, previousVersion: 'unknown', newVersion: 'unknown',
    commitHash: 'unknown', cleaned: false, built: false, reinstalledShims: 0,
    syncedPlugins: false, syncedIdes: [], syncedWorktrees: 0, durationMs: 0, message: '' };
  let stage = 'locate installed engine';
  try {
    const root = resolveUpdateEngineRoot(options.repoRoot);
    result.engineRoot = root;
    const before = updater.getVersionReport(root);
    result.previousVersion = result.newVersion = before.currentVersion;
    result.commitHash = before.localCommit;
    if (options.checkOnly) return { ...result, success: true, message: 'Check only; no updates performed' };
    if (options.pull) {
      stage = 'fast-forward source pull';
      const pull = updater.pullLatest(root);
      if (!pull.pulled) throw new Error(pull.error ?? 'Git pull failed');
    }
    if (options.bump) VersionManager.syncMonorepoVersions(root, VersionManager.bumpSemver(before.currentVersion, options.bump));
    if (options.clean) { stage = 'clear build caches'; updater.cleanWorkspace(root); result.cleaned = true; }
    stage = 'install dependencies'; updater.installDependencies(root);
    stage = 'build engine';
    const build = updater.rebuild(root);
    if (!build.built) throw new Error(build.error ?? 'Build failed');
    result.built = true;
    stage = 'refresh installed integrations';
    const installed = updater.reinstallPC(root, options.projectRoot ?? process.cwd());
    result.reinstalledShims = installed.shimsCount; result.syncedIdes = installed.idesSynced;
    result.syncedPlugins = installed.idesSynced.length > 0;
    const after = updater.getVersionReport(root);
    result.newVersion = after.currentVersion; result.commitHash = after.localCommit; result.success = true;
    result.message = `${options.pull ? 'Fast-forward pull completed' : 'Local source rebuilt'}; dependencies, build and listed integrations refreshed. Reload active IDE/MCP sessions.`;
  } catch (error) { result.message = `Update failed during ${stage}: ${error instanceof Error ? error.message : String(error)}`; }
  result.durationMs = Date.now() - start;
  return result;
}
