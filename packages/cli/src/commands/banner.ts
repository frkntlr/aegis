import { ActiveHeadResolver } from '@aegis/shared';

export function showBanner(): void {
  const activeWt = ActiveHeadResolver.resolveActiveWorktree();
  const wtTag = activeWt !== 'default' ? ` [Worktree: ${activeWt}]` : '';
  console.log(`🛡️  AEGIS - Autonomous Vibe Coding Engine (v0.1.0)${wtTag}`);
  console.log('──────────────────────────────────────────────────');
}
