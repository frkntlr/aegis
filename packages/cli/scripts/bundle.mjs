import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliRoot, '../..');

function resolveWorkspaceSources() {
  const map = new Map();
  for (const rel of ['packages', 'packages/core', 'packages/plugins']) {
    const dir = path.join(repoRoot, rel);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const pkgFile = path.join(dir, entry, 'package.json');
      const srcIndex = path.join(dir, entry, 'src', 'index.ts');
      if (!fs.existsSync(pkgFile) || !fs.existsSync(srcIndex)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      if (pkg.name) map.set(pkg.name, srcIndex);
    }
  }
  return map;
}

function createWorkspaceSrcPlugin() {
  const workspaceMap = resolveWorkspaceSources();
  return {
    name: 'aegis-workspace-sources',
    setup(build) {
      build.onResolve({ filter: /^@aegis\// }, (args) => {
        const target = workspaceMap.get(args.path);
        return target ? { path: target } : null;
      });
    }
  };
}

const sharedConfig = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['typescript'],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import * as __nodePath from 'node:path'; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __nodePath.dirname(__filename);"
  }
};

await Promise.all([
  esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(cliRoot, 'src/bin/aegis.ts')],
    outfile: path.join(cliRoot, 'dist/bin/aegis.js')
  }),
  esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(cliRoot, 'src/index.ts')],
    outfile: path.join(cliRoot, 'dist/index.js'),
    plugins: [createWorkspaceSrcPlugin()]
  })
]);
