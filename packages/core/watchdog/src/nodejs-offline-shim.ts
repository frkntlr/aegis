/**
 * @file nodejs-offline-shim.ts
 * Zero-dependency runtime interceptor for offline test execution.
 * Blocks globalThis.fetch, node:dns, node:net, node:http, and node:https.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

let isInstalled = false;
let blockedAttempts = 0;

let originalFetch: typeof globalThis.fetch | undefined;
let originalDnsLookup: typeof dns.lookup | undefined;
const originalDnsResolvers = new Map<string, unknown>();
let originalDnsPromisesLookup: typeof dnsPromises.lookup | undefined;
const originalDnsPromisesResolvers = new Map<string, unknown>();
let originalSocketConnect: typeof net.Socket.prototype.connect | undefined;
let originalHttpRequest: typeof http.request | undefined;
let originalHttpGet: typeof http.get | undefined;
let originalHttpsRequest: typeof https.request | undefined;
let originalHttpsGet: typeof https.get | undefined;

const DNS_RESOLVE_METHODS = [
  'resolve', 'resolve4', 'resolve6', 'resolveCname', 'resolveMx',
  'resolveNs', 'resolvePtr', 'resolveSrv', 'resolveTxt', 'resolveSoa',
  'resolveNaptr', 'resolveCaa', 'reverse'
] as const;

export function getBlockedAttemptsCount(): number {
  return blockedAttempts;
}

export function resetBlockedAttemptsCount(): void {
  blockedAttempts = 0;
}

function createOfflineError(code: 'ECONNREFUSED' | 'ENOTFOUND', syscall: string, msg: string): Error {
  return Object.assign(new Error(msg), { code, syscall, errno: -4078 });
}

function patchFetch(): void {
  if (typeof globalThis.fetch === 'function') {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (): Promise<Response> => {
      blockedAttempts++;
      const cause = createOfflineError('ECONNREFUSED', 'connect', 'connect ECONNREFUSED 127.0.0.1:0');
      const err = new TypeError('fetch failed');
      (err as unknown as { cause: unknown }).cause = cause;
      throw err;
    };
  }
}

function patchDnsLookup(): void {
  originalDnsLookup = dns.lookup;
  (dns as unknown as { lookup: unknown }).lookup = (
    hostname: string,
    optsOrCb: unknown,
    maybeCb?: unknown
  ): void => {
    blockedAttempts++;
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    const err = createOfflineError('ENOTFOUND', 'getaddrinfo', `getaddrinfo ENOTFOUND ${hostname}`);
    if (typeof cb === 'function') {
      process.nextTick(() => (cb as (err: Error) => void)(err));
      return;
    }
    throw err;
  };
}

function patchDnsResolvers(): void {
  const dnsRecord = dns as unknown as Record<string, unknown>;
  for (const method of DNS_RESOLVE_METHODS) {
    if (typeof dnsRecord[method] === 'function') {
      originalDnsResolvers.set(method, dnsRecord[method]);
      dnsRecord[method] = (hostname: string, ...args: unknown[]): void => {
        blockedAttempts++;
        const cb = args[args.length - 1];
        const err = createOfflineError('ENOTFOUND', method, `query ${method} ENOTFOUND ${hostname}`);
        if (typeof cb === 'function') {
          process.nextTick(() => (cb as (err: Error) => void)(err));
          return;
        }
        throw err;
      };
    }
  }
}

function patchDnsPromises(): void {
  originalDnsPromisesLookup = dnsPromises.lookup;
  dnsPromises.lookup = async (hostname: string): Promise<never> => {
    blockedAttempts++;
    throw createOfflineError('ENOTFOUND', 'getaddrinfo', `getaddrinfo ENOTFOUND ${hostname}`);
  };

  const promiseRecord = dnsPromises as unknown as Record<string, unknown>;
  for (const method of DNS_RESOLVE_METHODS) {
    if (typeof promiseRecord[method] === 'function') {
      originalDnsPromisesResolvers.set(method, promiseRecord[method]);
      promiseRecord[method] = async (hostname: string): Promise<never> => {
        blockedAttempts++;
        throw createOfflineError('ENOTFOUND', method, `query ${method} ENOTFOUND ${hostname}`);
      };
    }
  }
}

function patchNet(): void {
  originalSocketConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ..._args: unknown[]): net.Socket {
    blockedAttempts++;
    const err = createOfflineError('ECONNREFUSED', 'connect', 'connect ECONNREFUSED (Offline Test Shield)');
    process.nextTick(() => {
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
      } else {
        this.destroy(err);
      }
    });
    return this;
  };
}

function patchHttp(): void {
  originalHttpRequest = http.request;
  originalHttpGet = http.get;
  originalHttpsRequest = https.request;
  originalHttpsGet = https.get;

  (http as unknown as { request: unknown }).request = (...args: unknown[]) => {
    blockedAttempts++;
    return (originalHttpRequest as (...a: unknown[]) => http.ClientRequest).apply(http, args);
  };
  (http as unknown as { get: unknown }).get = (...args: unknown[]) => {
    blockedAttempts++;
    return (originalHttpGet as (...a: unknown[]) => http.ClientRequest).apply(http, args);
  };
  (https as unknown as { request: unknown }).request = (...args: unknown[]) => {
    blockedAttempts++;
    return (originalHttpsRequest as (...a: unknown[]) => http.ClientRequest).apply(https, args);
  };
  (https as unknown as { get: unknown }).get = (...args: unknown[]) => {
    blockedAttempts++;
    return (originalHttpsGet as (...a: unknown[]) => http.ClientRequest).apply(https, args);
  };
}

function unpatchDns(): void {
  if (originalDnsLookup) {
    dns.lookup = originalDnsLookup;
    originalDnsLookup = undefined;
  }
  const dnsRecord = dns as unknown as Record<string, unknown>;
  for (const [method, orig] of originalDnsResolvers.entries()) {
    dnsRecord[method] = orig;
  }
  originalDnsResolvers.clear();

  if (originalDnsPromisesLookup) {
    dnsPromises.lookup = originalDnsPromisesLookup;
    originalDnsPromisesLookup = undefined;
  }
  const promiseRecord = dnsPromises as unknown as Record<string, unknown>;
  for (const [method, orig] of originalDnsPromisesResolvers.entries()) {
    promiseRecord[method] = orig;
  }
  originalDnsPromisesResolvers.clear();
}

function unpatchHttp(): void {
  if (originalHttpRequest) http.request = originalHttpRequest;
  if (originalHttpGet) http.get = originalHttpGet;
  if (originalHttpsRequest) https.request = originalHttpsRequest;
  if (originalHttpsGet) https.get = originalHttpsGet;
  originalHttpRequest = undefined;
  originalHttpGet = undefined;
  originalHttpsRequest = undefined;
  originalHttpsGet = undefined;
}

export function installOfflineShim(): void {
  if (isInstalled) return;
  patchFetch();
  patchDnsLookup();
  patchDnsResolvers();
  patchDnsPromises();
  patchNet();
  patchHttp();
  isInstalled = true;
}

export function uninstallOfflineShim(): void {
  if (!isInstalled) return;
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = undefined;
  }
  unpatchDns();
  if (originalSocketConnect) {
    net.Socket.prototype.connect = originalSocketConnect;
    originalSocketConnect = undefined;
  }
  unpatchHttp();
  isInstalled = false;
}

export function isOfflineShimInstalled(): boolean {
  return isInstalled;
}

// Auto-activate when preloaded via NODE_OPTIONS or required directly
if (process.env.AEGIS_OFFLINE_SHIM_ACTIVE === '1') {
  installOfflineShim();
}
