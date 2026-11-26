import type * as http from 'node:http';
import { debugLogIgnored, safeParseJson } from '@aegis/shared';

export class HttpRequestError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'HttpRequestError';
    this.statusCode = statusCode;
  }
}

export function isAllowedLocalOrigin(origin: string | undefined, expectedPort: number): boolean {
  if (origin === undefined) return true;
  if (!origin || origin === 'null') return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:') return false;
    if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) return false;
    if (u.origin !== origin) return false;
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    const effectivePort = Number(u.port || '80');
    return isLocal && expectedPort > 0 && effectivePort === expectedPort;
  } catch (err: unknown) {
    debugLogIgnored('server-security:isAllowedLocalOrigin', err);
    return false;
  }
}

export function parseJsonObjectText(bodyStr: string): Record<string, unknown> {
  if (!bodyStr) return {};
  const parsed = safeParseJson<unknown>(bodyStr);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpRequestError('Invalid JSON body: expected JSON object.', 400);
  }
  return parsed as Record<string, unknown>;
}

function payloadTooLargeError(): HttpRequestError {
  return new HttpRequestError('Payload Too Large: İstek boyutu 1 MB sınırını aştı.', 413);
}

export function readJsonObjectBody(
  req: http.IncomingMessage,
  maxBytes = 1024 * 1024
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let tooLarge = false;
    let settled = false;
    let drainTimer: NodeJS.Timeout | undefined;
    const fail = (err: unknown): void => {
      if (settled) return;
      settled = true;
      if (drainTimer) clearTimeout(drainTimer);
      reject(err);
    };
    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      receivedBytes += buf.length;
      if (tooLarge) return;
      if (receivedBytes > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        drainTimer = setTimeout(() => { req.destroy(); fail(payloadTooLargeError()); }, 5000);
        drainTimer.unref();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      if (drainTimer) clearTimeout(drainTimer);
      if (tooLarge) return fail(payloadTooLargeError());
      settled = true;
      try { resolve(parseJsonObjectText(Buffer.concat(chunks).toString('utf8'))); } catch (err: unknown) { reject(err); }
    });
    req.on('error', fail);
    req.on('close', () => { if (!settled && !req.complete) fail(new HttpRequestError('Request closed before completion.', 400)); });
  });
}

export function sendJsonError(res: http.ServerResponse, err: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  const hasCode =
    err &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number';
  const statusCode =
    err instanceof HttpRequestError
      ? err.statusCode
      : hasCode
        ? (err as { statusCode: number }).statusCode
        : 400;
  const msg = err instanceof Error ? err.message : String(err);
  const headers: http.OutgoingHttpHeaders = { 'Content-Type': 'application/json' };
  if (statusCode === 413) headers.Connection = 'close';
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify({ success: false, error: msg }));
}
