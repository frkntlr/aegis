import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveSafeRepoRoot } from '@aegis/shared';
import type { TeamworkPlan } from '@aegis/orchestrator';

export function teamworkPlanPath(planId: string): string {
  if (!/^tw-[a-zA-Z0-9_-]+$/.test(planId)) throw new Error('Invalid teamwork plan ID');
  return path.join(resolveSafeRepoRoot(), '.aegis', 'teamwork-plans', `${planId}.json`);
}

export function saveTeamworkPlan(plan: TeamworkPlan): void {
  const file = teamworkPlanPath(plan.planId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(plan), 'utf8');
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function loadTeamworkPlan(planId: string): TeamworkPlan {
  const file = teamworkPlanPath(planId);
  if (!fs.existsSync(file)) throw new Error(`Teamwork plan not found: ${planId}; create and save the plan first`);
  const plan = JSON.parse(fs.readFileSync(file, 'utf8')) as TeamworkPlan;
  if (plan.planId !== planId || !Array.isArray(plan.tracks)) throw new Error('Invalid saved teamwork plan');
  return plan;
}
