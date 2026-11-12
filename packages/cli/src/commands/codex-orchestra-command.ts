import * as fs from 'node:fs';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { CodexOrchestra, type TeamworkPlan } from '@aegis/orchestrator';
import { listOrchestraRecovery, orchestraResumeHandoff, orchestraRecoveryStatus } from './codex-orchestra-recovery.js';

interface OrchestraArgs {
  command: string;
  positional: string[];
  options: Map<string, string>;
}

const OPTIONS: Record<string, string[]> = {
  create: ['workers', 'mode', 'max-depth'], next: ['available'],
  status: [], list: [], recovery: [], resume: [],
  defer: ['resume-after', 'agent-stopped', 'checkpoint'],
  start: [], delegate: [], complete: [], fail: [], 'cancel-dispatch': []
};

function parseArgs(args: string[]): OrchestraArgs {
  const command = args[0];
  if (!command || !Object.hasOwn(OPTIONS, command)) throw new Error(`Expected ${Object.keys(OPTIONS).join(', ')}`);
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (const arg of args.slice(1)) {
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    if (arg === '--agent-stopped' && command === 'defer' && !options.has('agent-stopped')) {
      options.set('agent-stopped', 'true'); continue;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match || match[1] === 'agent-stopped' || !OPTIONS[command].includes(match[1]) || options.has(match[1])) {
      throw new Error(`Unsupported or repeated option: ${arg}`);
    }
    options.set(match[1], match[2]);
  }
  const min = ['start', 'delegate', 'complete', 'fail', 'cancel-dispatch', 'defer'].includes(command) ? 3 : command === 'list' || command === 'status' ? 0 : 1;
  const max = command === 'status' ? 1 : min;
  const acceptsEvidence = ['complete', 'fail', 'cancel-dispatch', 'defer'].includes(command);
  if (positional.length < min || (!acceptsEvidence && positional.length > max)) throw new Error(`Invalid arguments for ${command}`);
  return { command, positional, options };
}

function integerOption(options: Map<string, string>, name: string, min = 1): number | undefined {
  const text = options.get(name);
  if (text === undefined) return undefined;
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < min) {
    throw new Error(`--${name} must be an integer >= ${min}`);
  }
  return Number(text);
}

function readJson<T>(file: string): T {
  const bytes = fs.readFileSync(file);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8';
  return JSON.parse(bytes.toString(encoding).replace(/^\uFEFF/, '')) as T;
}

function createRun(engine: CodexOrchestra, parsed: OrchestraArgs): unknown {
  const maxWorkers = integerOption(parsed.options, 'workers');
  if (maxWorkers === undefined) throw new Error('create requires --workers=<available worker capacity excluding the coordinator>');
  const mode = parsed.options.get('mode') ?? 'brokered';
  if (mode !== 'brokered' && mode !== 'nested' && mode !== 'sequential') throw new Error('Invalid --mode; expected brokered, nested or sequential');
  return engine.create(readJson<TeamworkPlan>(parsed.positional[0]), {
    maxWorkers, maxDepth: integerOption(parsed.options, 'max-depth'), mode
  });
}

function executeCommand(engine: CodexOrchestra, parsed: OrchestraArgs): unknown {
  const [runId, taskId, value] = parsed.positional;
  const evidence = parsed.positional.slice(2).join(' ');
  switch (parsed.command) {
    case 'create': return createRun(engine, parsed);
    case 'status': return runId ? engine.status(runId) : listOrchestraRecovery(engine);
    case 'list': return listOrchestraRecovery(engine);
    case 'recovery': return orchestraRecoveryStatus(engine, runId);
    case 'resume': return orchestraResumeHandoff(engine, runId);
    case 'defer': return deferRun(engine, parsed);
    case 'next': return engine.dispatch(runId, integerOption(parsed.options, 'available', 0));
    case 'start': return engine.acknowledge(runId, taskId, value);
    case 'delegate': return engine.delegate(runId, taskId, readJson(value));
    case 'complete': return engine.finish(runId, taskId, { success: true, evidence });
    case 'fail': return engine.finish(runId, taskId, { success: false, evidence });
    case 'cancel-dispatch': return engine.cancelDispatch(runId, taskId, evidence);
    default: throw new Error('Unsupported orchestra command');
  }
}

function deferRun(engine: CodexOrchestra, parsed: OrchestraArgs): unknown {
  const resumeAfter = parsed.options.get('resume-after');
  if (!resumeAfter || parsed.options.get('agent-stopped') !== 'true') {
    throw new Error('defer requires --resume-after=<UTC-ISO-time> and --agent-stopped acknowledgment');
  }
  const reason = parsed.positional.slice(2).join(' ');
  return engine.defer(parsed.positional[0], parsed.positional[1], {
    reason, checkpoint: parsed.options.get('checkpoint') ?? reason, resumeAfter, agentStopped: true
  });
}

/** Return dispatch instructions; only the host's native agent tools execute them. */
export function handleCodexOrchestra(...args: string[]): void {
  try {
    const parsed = parseArgs(args);
    const engine = new CodexOrchestra(resolveSafeRepoRoot());
    console.log(JSON.stringify(executeCommand(engine, parsed), null, 2));
  } catch (error: unknown) {
    console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
