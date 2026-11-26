import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  debugLogIgnored,
  formatErrorMessage,
  quoteWinBatchArg,
  quoteWinCmdArg,
  resolveNpmInvocation
} from './runtime-helpers.js';

test('formatErrorMessage formats Error, string, primitive, and uncoercible objects', () => {
  assert.equal(formatErrorMessage(new Error('boom')), 'boom');
  assert.equal(formatErrorMessage('plain error'), 'plain error');
  assert.equal(formatErrorMessage(42), '42');
  const nullProto = Object.create(null) as Record<string, unknown>;
  assert.equal(formatErrorMessage(nullProto), 'Unknown error');
});

test('debugLogIgnored writes to stderr only when AEGIS_DEBUG is 1', () => {
  const prevDebug = process.env.AEGIS_DEBUG;
  const origWrite = process.stderr.write.bind(process.stderr);
  const chunks: string[] = [];
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stderr.write;
  try {
    delete process.env.AEGIS_DEBUG;
    debugLogIgnored('unit-scope', new Error('hidden'));
    assert.equal(chunks.length, 0);
    process.env.AEGIS_DEBUG = '1';
    debugLogIgnored('unit-scope', new Error('visible'));
    assert.deepEqual(chunks, ['[aegis:unit-scope] visible\n']);
  } finally {
    process.stderr.write = origWrite;
    if (prevDebug === undefined) delete process.env.AEGIS_DEBUG;
    else process.env.AEGIS_DEBUG = prevDebug;
  }
});

test('quoteWinCmdArg quotes metacharacters, doubles backslashes before %/!, and rejects control chars', () => {
  assert.equal(quoteWinCmdArg(''), '""');
  assert.equal(quoteWinCmdArg('plain-arg'), 'plain-arg');
  assert.equal(quoteWinCmdArg('a b'), '"a b"');
  assert.equal(quoteWinCmdArg('a&echo hi'), '"a&echo hi"');
  assert.equal(quoteWinCmdArg('%PATH%'), '""^%"PATH"^%""');
  assert.equal(quoteWinCmdArg('\\%PATH\\%'), '"\\\\"^%"PATH\\\\"^%""');
  assert.equal(quoteWinCmdArg('\\!VAR\\!'), '"\\\\"^!"VAR\\\\"^!""');
  assert.equal(quoteWinCmdArg('a"b'), '"a"\\^""b"');
  assert.equal(quoteWinCmdArg('foo\\'), 'foo\\');
  assert.equal(quoteWinCmdArg('foo bar\\'), '"foo bar\\\\"');
  assert.equal(quoteWinCmdArg('foo\\"bar'), '"foo\\\\"\\^""bar"');
  assert.throws(() => quoteWinCmdArg('bad\narg'));
  assert.throws(() => quoteWinCmdArg('bad\rarg'));
  assert.throws(() => quoteWinCmdArg('bad\0arg'));
});

test('quoteWinBatchArg quotes safe batch args and fails closed on quotes or control chars', () => {
  assert.equal(quoteWinBatchArg('a & b'), '"a & b"');
  assert.equal(quoteWinBatchArg('\\%PATH\\%'), '"\\\\"^%"PATH\\\\"^%""');
  assert.throws(() => quoteWinBatchArg('a"b'), /unsupported quotes/i);
  assert.throws(() => quoteWinBatchArg('a"&echo PWNED>pwned.txt&"'), /unsupported quotes/i);
  assert.throws(() => quoteWinBatchArg('bad\narg'));
  assert.throws(() => quoteWinBatchArg('bad\rarg'));
  assert.throws(() => quoteWinBatchArg('bad\0arg'));
});

test('resolveNpmInvocation uses process.execPath + npm-cli.js and executes cleanly', () => {
  const inv = resolveNpmInvocation(['--version']);
  assert.equal(inv.command, process.execPath);
  assert.equal(inv.args.length, 2);
  assert.match(inv.args[0], /npm-cli\.js$/i);
  const res = cp.spawnSync(inv.command, inv.args, {
    encoding: 'utf8',
    shell: false,
    timeout: 15000
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('resolveNpmInvocation fallback handles win32 quoting and posix npm', () => {
  const winInv = resolveNpmInvocation(['test', '--', 'a & b'], {
    platform: 'win32',
    npmCliPath: null
  });
  assert.match(winInv.command.toLowerCase(), /cmd\.exe$/);
  assert.equal(winInv.args[0], '/d');
  assert.equal(winInv.args[1], '/s');
  assert.equal(winInv.args[2], '/c');
  assert.equal(winInv.args[3], 'npm.cmd test -- "a & b"');
  assert.equal(winInv.windowsVerbatimArguments, true);

  const posixInv = resolveNpmInvocation(['test', '--', 'target'], {
    platform: 'linux',
    npmCliPath: null
  });
  assert.deepEqual(posixInv, { command: 'npm', args: ['test', '--', 'target'] });
});

test('resolveNpmInvocation win32 npm.cmd fallback fails closed on embedded quotes while primary path allows them', () => {
  assert.throws(
    () => resolveNpmInvocation(['--version', 'a"&echo PWNED>pwned.txt&"'], {
      platform: 'win32',
      npmCliPath: null
    }),
    /unsupported quotes/i
  );
  const directInv = resolveNpmInvocation(['--version', 'a"b'], {
    platform: 'win32',
    npmCliPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
  });
  assert.equal(directInv.command, process.execPath);
  assert.deepEqual(directInv.args, [
    'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    '--version',
    'a"b'
  ]);
});

test('resolveNpmInvocation honors existing npm_execpath pointing to npm-cli.js', () => {
  const prev = process.env.npm_execpath;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-npm-exec-'));
  const fakeCli = path.join(dir, 'npm-cli.js');
  fs.writeFileSync(fakeCli, 'console.log("0.0.0");\n', 'utf8');
  try {
    process.env.npm_execpath = fakeCli;
    const inv = resolveNpmInvocation(['--version']);
    assert.equal(inv.command, process.execPath);
    assert.deepEqual(inv.args, [fakeCli, '--version']);
  } finally {
    if (prev === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
