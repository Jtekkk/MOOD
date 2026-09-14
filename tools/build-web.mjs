// build-web.mjs — assemble a clean, upload-ready static bundle in dist-web/.
//
// MOOD is already a pure static site (HTML + CSS + ES-module JS + assets, all
// relative paths, no server calls). This just copies the files a web host
// actually needs — dropping the dev-only bits (server.mjs, tools/, electron/,
// node_modules, docs/) — so you can drag the folder straight onto a static
// host like Porkbun. Zero dependencies; run with: npm run build:web
import { rm, mkdir, cp, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-web');

const INCLUDE_FILES = ['index.html', 'styles.css'];
const INCLUDE_DIRS = ['src', 'assets'];

async function dirSize(p) {
  let total = 0;
  for (const e of await readdir(p, { withFileTypes: true })) {
    const fp = join(p, e.name);
    total += e.isDirectory() ? await dirSize(fp) : (await stat(fp)).size;
  }
  return total;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const f of INCLUDE_FILES) await cp(join(ROOT, f), join(OUT, f));
for (const d of INCLUDE_DIRS) await cp(join(ROOT, d), join(OUT, d), { recursive: true });

const bytes = await dirSize(OUT);
const mb = (bytes / 1048576).toFixed(1);
console.log('Built dist-web/ — upload its contents to your static host.');
console.log(`  files: ${INCLUDE_FILES.join(', ')} + ${INCLUDE_DIRS.join('/, ')}/`);
console.log(`  total size: ${mb} MB (mostly background music)`);
