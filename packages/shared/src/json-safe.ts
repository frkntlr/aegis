import * as fs from 'node:fs';

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function safeParseJson<T = unknown>(raw: string): T {
  return JSON.parse(stripBom(raw)) as T;
}

export function readJsonSafe<T = unknown>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return safeParseJson<T>(raw);
}
