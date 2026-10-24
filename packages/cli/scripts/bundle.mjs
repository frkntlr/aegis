import * as esbuild from 'esbuild';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliRoot = path.resolve(__dirname, '..');

await esbuild.build({
  entryPoints: [path.join(cliRoot, 'src/bin/aegis.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['typescript'],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import * as __nodePath from 'node:path'; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __nodePath.dirname(__filename);"
  },
  outfile: path.join(cliRoot, 'dist/bin/aegis.js')
});
