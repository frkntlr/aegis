/**
 * @file http-transport.ts
 * Shared HTTP POST transport with body-inclusive timeout and multi-Set-Cookie preservation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { HttpResponse, HttpTransportOptions } from './types.js';

function collectHeaders(headers: Headers): Record<string, string | string[]> {
  const headerObj: Record<string, string | string[]> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== 'set-cookie') {
      headerObj[lower] = value;
    }
  });
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof withGetSetCookie.getSetCookie === 'function'
    ? withGetSetCookie.getSetCookie()
    : [];
  if (setCookies.length > 0) {
    headerObj['set-cookie'] = setCookies;
  } else {
    const single = headers.get('set-cookie');
    if (single) headerObj['set-cookie'] = single;
  }
  return headerObj;
}

function readBodyWithAbort(res: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('Request aborted'));
  return new Promise<string>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason ?? new Error('Request aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    res.text().then(
      txt => { signal.removeEventListener('abort', onAbort); resolve(txt); },
      err => { signal.removeEventListener('abort', onAbort); reject(err); }
    );
  });
}

export async function fetchPostWithTimeout(
  url: string,
  body: string,
  options?: HttpTransportOptions,
  defaultTimeoutMs = 15000
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
  const timer = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: options?.headers,
      body,
      signal: controller.signal
    });
    const headerObj = collectHeaders(res.headers);
    const bodyText = await readBodyWithAbort(res, controller.signal);
    return {
      status: res.status,
      text: async () => bodyText,
      headers: headerObj
    };
  } finally {
    clearTimeout(timer);
  }
}
