import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GodotLocator } from '../godot-locator.js';
import { OracleCache } from './oracle-cache.js';
import type { ClassInfo, DoctoolRunnerOptions, MethodInfo, PropertyInfo, SignalInfo } from './classdb-types.js';

interface RawApiDump {
  classes?: RawClass[];
  builtin_classes?: RawClass[];
}

interface RawClass {
  name: string;
  inherits?: string;
  methods?: RawMethod[];
  properties?: RawProperty[];
  signals?: RawSignal[];
}

interface RawMethod {
  name: string;
  return_value?: { type: string };
  is_static?: boolean;
  arguments?: Array<{ name: string; type: string; default_value?: string }>;
}

interface RawProperty {
  name: string;
  type: string;
  setter?: string;
  getter?: string;
}

interface RawSignal {
  name: string;
  arguments?: Array<{ name: string; type: string }>;
}

export class DoctoolRunner {
  private readonly cache: OracleCache;
  private readonly godotBinary?: string;

  constructor(options: DoctoolRunnerOptions = {}) {
    this.cache = new OracleCache({ cacheDir: options.cacheDir });
    this.godotBinary = options.godotBinary;
  }

  public dumpAndIndexApi(force = false): Map<string, ClassInfo> {
    const inst = this.godotBinary
      ? GodotLocator.inspectBinary(this.godotBinary)
      : GodotLocator.findGodot();
    if (!inst) return new Map();

    const version = inst.versionString || 'unknown';
    const cacheKey = `classdb_index_${version}`;
    if (!force) {
      const cached = this.cache.get<Record<string, ClassInfo>>(cacheKey, version);
      if (cached) return new Map(Object.entries(cached));
    }

    const rawDump = this.executeDump(inst.binaryPath);
    if (!rawDump) return new Map();

    const indexed = this.parseRawApi(rawDump);
    const plainObj: Record<string, ClassInfo> = Object.fromEntries(indexed);
    this.cache.set(cacheKey, plainObj, version);
    return indexed;
  }

  private executeDump(binary: string): RawApiDump | undefined {
    const tempDir = path.resolve(this.cache.getCacheDir(), 'temp_dump');
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      execFileSync(binary, ['--headless', '--dump-extension-api'], {
        cwd: tempDir,
        stdio: 'pipe',
        timeout: 25000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      const dumpPath = path.join(tempDir, 'extension_api.json');
      if (!fs.existsSync(dumpPath)) return undefined;
      const rawText = fs.readFileSync(dumpPath, 'utf8');
      return JSON.parse(rawText) as RawApiDump;
    } catch {
      return undefined;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  public parseRawApi(dump: RawApiDump): Map<string, ClassInfo> {
    const result = new Map<string, ClassInfo>();
    const allClasses = [...(dump.classes || []), ...(dump.builtin_classes || [])];
    for (const raw of allClasses) {
      const info: ClassInfo = {
        name: raw.name,
        inherits: raw.inherits,
        methods: this.parseMethods(raw.methods),
        properties: this.parseProperties(raw.properties),
        signals: this.parseSignals(raw.signals)
      };
      result.set(raw.name, info);
    }
    return result;
  }

  private parseMethods(rawMethods?: RawMethod[]): MethodInfo[] {
    if (!rawMethods) return [];
    return rawMethods.map(m => ({
      name: m.name,
      returnType: m.return_value?.type || 'void',
      isStatic: Boolean(m.is_static),
      arguments: (m.arguments || []).map(a => ({
        name: a.name,
        type: a.type,
        defaultValue: a.default_value
      }))
    }));
  }

  private parseProperties(rawProps?: RawProperty[]): PropertyInfo[] {
    if (!rawProps) return [];
    return rawProps.map(p => ({
      name: p.name,
      type: p.type,
      setter: p.setter,
      getter: p.getter
    }));
  }

  private parseSignals(rawSignals?: RawSignal[]): SignalInfo[] {
    if (!rawSignals) return [];
    return rawSignals.map(s => ({
      name: s.name,
      arguments: (s.arguments || []).map(a => ({ name: a.name, type: a.type }))
    }));
  }
}
