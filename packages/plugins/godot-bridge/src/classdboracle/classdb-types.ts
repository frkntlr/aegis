export interface MethodArgument {
  name: string;
  type: string;
  defaultValue?: string;
}

export interface MethodInfo {
  name: string;
  returnType: string;
  arguments: MethodArgument[];
  description?: string;
  isStatic?: boolean;
}

export interface PropertyInfo {
  name: string;
  type: string;
  setter?: string;
  getter?: string;
  defaultValue?: string;
}

export interface SignalInfo {
  name: string;
  arguments: Array<{ name: string; type: string }>;
}

export interface ClassInfo {
  name: string;
  inherits?: string;
  description?: string;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  signals: SignalInfo[];
  constants?: Record<string, number | string>;
}

export interface ValidationResult {
  file?: string;
  line: number;
  severity: 'error' | 'warning';
  message: string;
  symbol?: string;
}

export interface DoctoolRunnerOptions {
  godotBinary?: string;
  cacheDir?: string;
  timeoutMs?: number;
}
