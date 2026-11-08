/**
 * @file teamwork-deliberate-command.ts
 * CLI command and MCP handlers for Multi-Agent Deliberation & Semantic AI Decomposition.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  TeamworkDeliberationEngine,
  TeamworkCoordinator,
  type DeliberationOptions
} from '@aegis/orchestrator';
import { showBanner } from './banner.js';

interface DeliberateFlags {
  json: boolean;
  persistMesh: boolean;
  depth: 'quick' | 'standard' | 'deep';
  files: string[];
}

function parseDeliberateArgs(args: string[]): DeliberateFlags {
  const flags: DeliberateFlags = {
    json: false,
    persistMesh: true,
    depth: 'standard',
    files: []
  };

  for (const a of args) {
    if (a === '--json' || a === '-j') flags.json = true;
    else if (a === '--no-mesh') flags.persistMesh = false;
    else if (a === '--quick') flags.depth = 'quick';
    else if (a === '--deep') flags.depth = 'deep';
    else if (a && !a.startsWith('-')) flags.files.push(a);
  }
  return flags;
}

export async function handleTeamworkDeliberate(objectiveArg?: string, ...args: string[]): Promise<void> {
  if (!objectiveArg || objectiveArg.trim().length === 0) {
    showBanner();
    console.error('❌ Usage: aegis tw:deliberate "<objective>" [targetFiles...] [--json] [--deep|--quick] [--no-mesh]');
    return;
  }

  const { json, persistMesh, depth, files } = parseDeliberateArgs(args);
  const engine = new TeamworkDeliberationEngine();
  const options: DeliberationOptions = { persistMesh, depth, files };
  const result = engine.deliberate(objectiveArg.trim(), files, options);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  showBanner();
  console.log(engine.formatDeliberationBriefing(result));
}

export function mcpTeamworkDeliberate(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || '');
  if (!objective) {
    return JSON.stringify({ error: 'Missing required argument: objective' });
  }
  const files = Array.isArray(args.files) ? args.files.map(String) : [];
  const persistMesh = typeof args.persistMesh === 'boolean' ? args.persistMesh : true;
  const depth = (typeof args.depth === 'string' && ['quick', 'standard', 'deep'].includes(args.depth))
    ? (args.depth as 'quick' | 'standard' | 'deep')
    : 'standard';

  const coordinator = new TeamworkCoordinator();
  const result = coordinator.deliberate(objective, files, { persistMesh, depth, files });
  return JSON.stringify(result, null, 2);
}
